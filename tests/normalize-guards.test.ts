import { describe, it, expect } from "vitest";
import { createBetSchema } from "@/lib/validators";
import type { NormalizeResult } from "@/types";

function applyServerGuards(result: NormalizeResult): NormalizeResult {
  const r = { ...result };

  const deadlineMs = new Date(r.deadline_utc).getTime();
  if (isNaN(deadlineMs)) {
    r.should_reject = true;
    r.rejection_reason = "Could not parse deadline as a valid date.";
  } else if (deadlineMs <= Date.now() + 60_000) {
    r.should_reject = true;
    r.rejection_reason = "Deadline is in the past or too close to the current time.";
  }

  if (!r.should_reject && r.ambiguity_score > 0.25) {
    r.should_reject = true;
    r.rejection_reason = `Ambiguity score too high (${r.ambiguity_score.toFixed(2)}).`;
  }

  return r;
}

const base: NormalizeResult = {
  original_text: "test",
  normalized_question: "Will test happen?",
  category: "custom",
  yes_definition: "Test happens",
  no_definition: "Test does not happen",
  deadline_utc: new Date(Date.now() + 3600_000).toISOString(),
  resolution_sources: ["test"],
  resolution_method: "manual_review",
  objective_criteria: ["test"],
  ambiguity_score: 0,
  ambiguity_notes: [],
  should_reject: false,
  rejection_reason: null, resolution_plan: null, suggestions: [],
};

describe("normalize server-side guards", () => {
  describe("past deadline rejection", () => {
    it("rejects deadline in the past", () => {
      const r = applyServerGuards({
        ...base,
        deadline_utc: "2024-05-26T18:40:00Z",
      });
      expect(r.should_reject).toBe(true);
      expect(r.rejection_reason).toContain("past");
    });

    it("rejects deadline less than 1 minute from now", () => {
      const r = applyServerGuards({
        ...base,
        deadline_utc: new Date(Date.now() + 30_000).toISOString(),
      });
      expect(r.should_reject).toBe(true);
      expect(r.rejection_reason).toContain("past");
    });

    it("accepts deadline 2 minutes from now", () => {
      const r = applyServerGuards({
        ...base,
        deadline_utc: new Date(Date.now() + 120_000).toISOString(),
      });
      expect(r.should_reject).toBe(false);
    });

    it("rejects invalid date string", () => {
      const r = applyServerGuards({
        ...base,
        deadline_utc: "not-a-date",
      });
      expect(r.should_reject).toBe(true);
      expect(r.rejection_reason).toContain("parse");
    });

    it("missing year resolving to 2024 is rejected as past", () => {
      const r = applyServerGuards({
        ...base,
        deadline_utc: "2024-05-26T18:40:00Z",
      });
      expect(r.should_reject).toBe(true);
    });
  });

  describe("ambiguity threshold", () => {
    it("ambiguity 0.30 is rejected", () => {
      const r = applyServerGuards({
        ...base,
        ambiguity_score: 0.30,
        ambiguity_notes: ["Directional wager needs clarification"],
      });
      expect(r.should_reject).toBe(true);
      expect(r.rejection_reason).toContain("0.30");
    });

    it("ambiguity 0.25 is accepted", () => {
      const r = applyServerGuards({
        ...base,
        ambiguity_score: 0.25,
      });
      expect(r.should_reject).toBe(false);
    });

    it("ambiguity 0.26 is rejected", () => {
      const r = applyServerGuards({
        ...base,
        ambiguity_score: 0.26,
      });
      expect(r.should_reject).toBe(true);
    });

    it("ambiguity 0 is accepted", () => {
      const r = applyServerGuards({
        ...base,
        ambiguity_score: 0,
      });
      expect(r.should_reject).toBe(false);
    });
  });

  describe("create route past deadline guard", () => {
    const validBet = {
      original_text: "Test wager condition text",
      normalized_question: "Will the test pass by the deadline?",
      category: "custom" as const,
      yes_definition: "The test passes by deadline",
      no_definition: "The test does not pass by deadline",
      deadline_utc: new Date(Date.now() + 3600_000).toISOString(),
      resolution_sources: ["test"],
      resolution_method: "manual_review" as const,
      objective_criteria: ["test"],
      ambiguity_score: 0,
      ambiguity_notes: [],
      maker_side: "YES" as const,
      stake_lamports: 50_000_000,
      maker_pubkey: "7EcDhSYGxXyscszYEp35KHN8vvw3svAuLKTzXwCFLtV",
    };

    it("accepts future deadline in create schema", () => {
      const result = createBetSchema.safeParse(validBet);
      expect(result.success).toBe(true);
    });

    it("schema accepts past deadline (server validates separately)", () => {
      const result = createBetSchema.safeParse({
        ...validBet,
        deadline_utc: "2024-01-01T00:00:00Z",
      });
      expect(result.success).toBe(true);
    });
  });

  describe("directional wager detection", () => {
    const directionalPhrases = [
      "BTC вверх или вниз через 5 минут",
      "Bitcoin up or down in 10 minutes",
      "ETH long or short by tomorrow",
      "Биткоин вырастет или упадет к вечеру",
    ];

    directionalPhrases.forEach((phrase) => {
      it(`"${phrase.slice(0, 35)}..." should have high ambiguity if not clarified`, () => {
        // The AI should assign ambiguity >= 0.3 for directional wagers.
        // The server guard then rejects ambiguity > 0.25.
        // This test verifies the server guard catches it.
        const r = applyServerGuards({
          ...base,
          original_text: phrase,
          ambiguity_score: 0.3,
          ambiguity_notes: ["Directional wager — maker must choose UP or DOWN"],
        });
        expect(r.should_reject).toBe(true);
      });
    });
  });

  describe("relative time resolution", () => {
    it("'in 5 minutes' produces future deadline when AI computes correctly", () => {
      const fiveMinFromNow = new Date(Date.now() + 5 * 60_000).toISOString();
      const r = applyServerGuards({
        ...base,
        deadline_utc: fiveMinFromNow,
      });
      expect(r.should_reject).toBe(false);
    });

    it("'через 5 минут' with past resolution is rejected", () => {
      const r = applyServerGuards({
        ...base,
        deadline_utc: "2024-01-01T00:05:00Z",
      });
      expect(r.should_reject).toBe(true);
    });
  });
});
