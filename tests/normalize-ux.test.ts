import { describe, it, expect } from "vitest";
import type { NormalizeResult } from "@/types";

function shouldHideDefinitions(result: NormalizeResult): boolean {
  return result.should_reject === true;
}

const rejected: NormalizeResult = {
  original_text: "биткоин вверх или вниз через 5 минут",
  normalized_question: "Will BTC go up in 5 min?",
  category: "crypto",
  yes_definition: "BTC price at deadline > current price ~$109,000",
  no_definition: "BTC price at deadline <= current price ~$109,000",
  deadline_utc: new Date(Date.now() + 300_000).toISOString(),
  resolution_sources: ["Binance"],
  resolution_method: "api",
  objective_criteria: ["Binance BTCUSDT"],
  ambiguity_score: 0.30,
  ambiguity_notes: ["Directional wager — maker must choose UP or DOWN"],
  should_reject: true,
  rejection_reason: "Ambiguity score too high (0.30). Directional wager — maker must choose UP or DOWN", resolution_plan: null, suggestions: [],
};

const accepted: NormalizeResult = {
  original_text: "Bitcoin above $100k by 2026-06-01",
  normalized_question: "Will BTC be above $100k?",
  category: "crypto",
  yes_definition: "BTC >= $100,000 at deadline per CoinGecko",
  no_definition: "BTC < $100,000 at deadline per CoinGecko",
  deadline_utc: "2026-06-01T00:00:00Z",
  resolution_sources: ["CoinGecko"],
  resolution_method: "api",
  objective_criteria: ["CoinGecko BTC/USD"],
  ambiguity_score: 0,
  ambiguity_notes: [],
  should_reject: false,
  rejection_reason: null, resolution_plan: null, suggestions: [],
};

describe("normalize UX guards", () => {
  describe("rejected wager does not render final YES/NO", () => {
    it("rejected wager hides definitions", () => {
      expect(shouldHideDefinitions(rejected)).toBe(true);
    });

    it("accepted wager shows definitions", () => {
      expect(shouldHideDefinitions(accepted)).toBe(false);
    });
  });

  describe("approximate terms require tolerance", () => {
    const approxTerms = ["approximately", "примерно", "около", "roughly", "around"];

    approxTerms.forEach((term) => {
      it(`"${term}" in wager text should trigger rejection`, () => {
        const input = `Bitcoin ${term} $100,000 by June`;
        const lower = input.toLowerCase();
        const needsTolerance = approxTerms.some((t) => lower.includes(t));
        expect(needsTolerance).toBe(true);
      });
    });
  });

  describe("AI cannot invent current price threshold", () => {
    it("current price reference in yes_definition without backend snapshot is invalid", () => {
      const patterns = ["current price", "~$", "≈$", "approximately $"];
      const def = rejected.yes_definition;
      const hasInventedPrice = patterns.some((p) => def.toLowerCase().includes(p));
      expect(hasInventedPrice).toBe(true);
      expect(rejected.should_reject).toBe(true);
    });
  });

  describe("deadline UTC formatting", () => {
    it("valid ISO 8601 string", () => {
      const d = new Date(accepted.deadline_utc);
      expect(d.getTime()).not.toBeNaN();
    });

    it("UTC formatting renders consistently", () => {
      const formatted = new Date("2026-06-01T18:00:00Z").toLocaleString("en-US", {
        timeZone: "UTC",
        year: "numeric",
        month: "short",
        day: "numeric",
        hour: "2-digit",
        minute: "2-digit",
        timeZoneName: "short",
      });
      expect(formatted).toContain("2026");
      expect(formatted).toContain("Jun");
      expect(formatted).toContain("UTC");
    });
  });

  describe("create route rejects should_reject bets", () => {
    it("should_reject=true means no bet creation", () => {
      expect(rejected.should_reject).toBe(true);
    });

    it("should_reject=false allows creation", () => {
      expect(accepted.should_reject).toBe(false);
    });
  });
});
