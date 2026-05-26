import { describe, it, expect } from "vitest";
import { normalizeRequestSchema, createBetSchema } from "@/lib/validators";
import { canonicalizeEvidence } from "@/lib/ai/resolver";
import { hashEvidence } from "@/lib/utils";
import { REJECTED_TOPICS, MAX_STAKE_LAMPORTS } from "@/lib/constants";
import type { EvidenceItem, ResolveResult } from "@/types";
import { z } from "zod";

const resolveResultSchema = z.object({
  bet_id: z.string(),
  winner_side: z.enum(["YES", "NO", "UNKNOWN"]),
  confidence: z.number().min(0).max(1),
  needs_manual_review: z.boolean(),
  evidence: z.array(
    z.object({
      source_url: z.string().min(1),
      source_name: z.string().min(1),
      published_or_observed_at: z.string().nullable(),
      relevant_excerpt: z.string().min(1),
      supports: z.enum(["YES", "NO", "NEUTRAL"]),
      explanation: z.string().min(1),
    })
  ),
  reasoning_summary: z.string(),
  failure_reason: z.string().nullable(),
});

describe("adversarial wager inputs", () => {
  describe("subjective conditions", () => {
    it("accepts text for normalization (AI decides rejection)", () => {
      const result = normalizeRequestSchema.safeParse({
        text: "The new Marvel movie will be better than the last one",
      });
      expect(result.success).toBe(true);
    });
  });

  describe("ambiguous deadlines", () => {
    it("rejects missing text", () => {
      expect(() => normalizeRequestSchema.parse({ text: "" })).toThrow();
    });

    it("accepts text with no deadline (AI suggests one)", () => {
      const result = normalizeRequestSchema.safeParse({
        text: "Bitcoin will hit 200k eventually",
      });
      expect(result.success).toBe(true);
    });
  });

  describe("blocked topics", () => {
    const blockedInputs = [
      "I bet someone will be assassinated next month",
      "Will there be a terrorism attack in Europe",
      "Child exploitation wager",
      "Suicide rate prediction",
      "Drug trafficking volume bet",
    ];

    blockedInputs.forEach((input) => {
      it(`blocks: "${input.slice(0, 40)}..."`, () => {
        const lower = input.toLowerCase();
        const blocked = REJECTED_TOPICS.some((t) => lower.includes(t));
        expect(blocked).toBe(true);
      });
    });
  });

  describe("disguised blocked topics", () => {
    it("does not catch obfuscated terms (defense in depth via AI)", () => {
      const input = "Will the leader of Country X be un-alived";
      const lower = input.toLowerCase();
      const blocked = REJECTED_TOPICS.some((t) => lower.includes(t));
      expect(blocked).toBe(false);
    });
  });

  describe("sarcasm and meme language", () => {
    it("accepts meme text for normalization", () => {
      const result = normalizeRequestSchema.safeParse({
        text: "Doge to the moon by Christmas fr fr no cap",
      });
      expect(result.success).toBe(true);
    });
  });

  describe("multiple outcomes", () => {
    it("accepts multi-outcome text (AI must normalize to YES/NO)", () => {
      const result = normalizeRequestSchema.safeParse({
        text: "Which team wins the World Cup: Brazil, Argentina, or Germany",
      });
      expect(result.success).toBe(true);
    });
  });

  describe("stake limits", () => {
    const validBet = {
      original_text: "Test condition for stake limits",
      normalized_question: "Will X happen by Y date?",
      category: "custom" as const,
      yes_definition: "X happens",
      no_definition: "X does not happen",
      deadline_utc: "2026-12-01T00:00:00Z",
      resolution_sources: ["source.com"],
      resolution_method: "web_research" as const,
      objective_criteria: ["criteria"],
      ambiguity_score: 0.1,
      ambiguity_notes: [],
      maker_side: "YES" as const,
      stake_lamports: 100_000_000,
      maker_pubkey: "7EcDhSYGxXyscszYEp35KHN8vvw3svAuLKTzXwCFLtV",
    };

    it("rejects negative stake", () => {
      expect(() =>
        createBetSchema.parse({ ...validBet, stake_lamports: -1 })
      ).toThrow();
    });

    it("rejects stake at boundary (MAX + 1)", () => {
      expect(() =>
        createBetSchema.parse({
          ...validBet,
          stake_lamports: MAX_STAKE_LAMPORTS + 1,
        })
      ).toThrow();
    });

    it("accepts stake at exact max", () => {
      const result = createBetSchema.safeParse({
        ...validBet,
        stake_lamports: MAX_STAKE_LAMPORTS,
      });
      expect(result.success).toBe(true);
    });
  });
});

describe("AI resolver red-team", () => {
  describe("malformed JSON responses", () => {
    it("rejects non-JSON string", () => {
      const result = resolveResultSchema.safeParse("not json");
      expect(result.success).toBe(false);
    });

    it("rejects empty object", () => {
      const result = resolveResultSchema.safeParse({});
      expect(result.success).toBe(false);
    });

    it("rejects missing required fields", () => {
      const result = resolveResultSchema.safeParse({
        bet_id: "test",
        winner_side: "YES",
      });
      expect(result.success).toBe(false);
    });
  });

  describe("unsupported winner values", () => {
    it("rejects DRAW as winner_side", () => {
      const result = resolveResultSchema.safeParse({
        bet_id: "test",
        winner_side: "DRAW",
        confidence: 0.9,
        needs_manual_review: false,
        evidence: [],
        reasoning_summary: "test",
        failure_reason: null,
      });
      expect(result.success).toBe(false);
    });

    it("rejects MAYBE as winner_side", () => {
      const result = resolveResultSchema.safeParse({
        bet_id: "test",
        winner_side: "MAYBE",
        confidence: 0.5,
        needs_manual_review: true,
        evidence: [],
        reasoning_summary: "test",
        failure_reason: null,
      });
      expect(result.success).toBe(false);
    });
  });

  describe("high confidence with no evidence", () => {
    it("schema accepts it but backend must flag for review", () => {
      const result = resolveResultSchema.safeParse({
        bet_id: "test",
        winner_side: "YES",
        confidence: 0.95,
        needs_manual_review: false,
        evidence: [],
        reasoning_summary: "I just know",
        failure_reason: null,
      });
      expect(result.success).toBe(true);
      expect(result.data!.evidence.length).toBe(0);
    });
  });

  describe("evidence with empty source URL", () => {
    it("rejects evidence item with empty source_url", () => {
      const result = resolveResultSchema.safeParse({
        bet_id: "test",
        winner_side: "YES",
        confidence: 0.9,
        needs_manual_review: false,
        evidence: [
          {
            source_url: "",
            source_name: "Trust me",
            published_or_observed_at: null,
            relevant_excerpt: "something",
            supports: "YES",
            explanation: "because",
          },
        ],
        reasoning_summary: "test",
        failure_reason: null,
      });
      expect(result.success).toBe(false);
    });
  });

  describe("conflicting evidence", () => {
    it("conflicting sources produce same hash regardless of order", () => {
      const ev1: EvidenceItem = {
        source_url: "https://yes.com",
        source_name: "Yes Source",
        published_or_observed_at: null,
        relevant_excerpt: "supports yes",
        supports: "YES",
        explanation: "yes",
      };
      const ev2: EvidenceItem = {
        source_url: "https://no.com",
        source_name: "No Source",
        published_or_observed_at: null,
        relevant_excerpt: "supports no",
        supports: "NO",
        explanation: "no",
      };

      const hash1 = hashEvidence(canonicalizeEvidence([ev1, ev2]));
      const hash2 = hashEvidence(canonicalizeEvidence([ev2, ev1]));
      expect(hash1.toString("hex")).toBe(hash2.toString("hex"));
    });
  });

  describe("confidence boundary", () => {
    it("rejects confidence > 1", () => {
      const result = resolveResultSchema.safeParse({
        bet_id: "test",
        winner_side: "YES",
        confidence: 1.5,
        needs_manual_review: false,
        evidence: [],
        reasoning_summary: "test",
        failure_reason: null,
      });
      expect(result.success).toBe(false);
    });

    it("rejects confidence < 0", () => {
      const result = resolveResultSchema.safeParse({
        bet_id: "test",
        winner_side: "YES",
        confidence: -0.1,
        needs_manual_review: false,
        evidence: [],
        reasoning_summary: "test",
        failure_reason: null,
      });
      expect(result.success).toBe(false);
    });
  });
});
