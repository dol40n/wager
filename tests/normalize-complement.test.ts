import { describe, it, expect } from "vitest";

/**
 * Tests that YES/NO definitions are logical complements.
 *
 * These are structural tests that can be run against any NormalizeResult
 * without calling the AI. They detect common complement violations:
 * - YES uses "at or before" but NO uses "at" (gap for "before" case)
 * - YES uses "above" but NO uses "below" (gap at exact target)
 * - Both use the same temporal qualifier differently
 */

interface ConditionPair {
  yes: string;
  no: string;
}

function detectComplementViolation(pair: ConditionPair): string | null {
  const y = pair.yes.toLowerCase();
  const n = pair.no.toLowerCase();

  // "at or before" vs "at" — the "before" window is not covered by NO
  if (
    (y.includes("at or before") || y.includes("on or before") || y.includes("at any point")) &&
    !n.includes("never") &&
    !n.includes("at no point") &&
    !n.includes("at any point") &&
    !n.includes("on or before") &&
    !n.includes("at or before")
  ) {
    return "YES covers a time range but NO only checks a single point";
  }

  // "above" vs "below" without equality — gap at exact target
  if (y.includes("above") && n.includes("below") && !n.includes("or below") && !n.includes("at or below")) {
    return "Gap at exact target: YES=above, NO=below, neither covers equality";
  }

  // Both say "greater than" — overlap or identical
  if (y.includes("greater than") && n.includes("greater than")) {
    return "Both YES and NO use 'greater than' — not complements";
  }

  // Check for proper complement pairs
  const validPairs = [
    { yesPattern: "strictly above", noPattern: "at or below" },
    { yesPattern: "above", noPattern: "at or below" },
    { yesPattern: "greater than", noPattern: "less than or equal" },
    { yesPattern: "reaches or exceeds", noPattern: "never reaches" },
    { yesPattern: "at any point", noPattern: "never" },
    { yesPattern: "occurs", noPattern: "does not occur" },
  ];

  const hasValidPair = validPairs.some(
    (p) => y.includes(p.yesPattern) && n.includes(p.noPattern)
  );

  if (!hasValidPair) {
    // Not necessarily wrong, but flag for review
    return null;
  }

  return null;
}

describe("YES/NO complement validation", () => {
  describe("detects non-complementary pairs", () => {
    it("catches 'at or before' vs 'at' mismatch", () => {
      const violation = detectComplementViolation({
        yes: "BTC reaches or exceeds $100,000 at or before 2026-06-01",
        no: "BTC is at or below $100,000 at 2026-06-01",
      });
      expect(violation).toBeTruthy();
    });

    it("catches 'above' vs 'below' gap", () => {
      const violation = detectComplementViolation({
        yes: "BTC is above $100,000",
        no: "BTC is below $100,000",
      });
      expect(violation).toBeTruthy();
    });

    it("catches both using 'greater than'", () => {
      const violation = detectComplementViolation({
        yes: "Value is greater than 50",
        no: "Value is greater than 50 from the other side",
      });
      expect(violation).toBeTruthy();
    });
  });

  describe("accepts valid complement pairs", () => {
    it("snapshot: 'strictly above' vs 'at or below'", () => {
      const violation = detectComplementViolation({
        yes: "BTC is strictly above $100,000 at 2026-06-01 per CoinGecko",
        no: "BTC is at or below $100,000 at 2026-06-01 per CoinGecko",
      });
      expect(violation).toBeNull();
    });

    it("threshold: 'reaches or exceeds...at any point' vs 'never reaches'", () => {
      const violation = detectComplementViolation({
        yes: "BTC reaches or exceeds $100,000 at any point on or before 2026-06-01 per CoinGecko",
        no: "BTC never reaches $100,000 at any point on or before 2026-06-01 per CoinGecko",
      });
      expect(violation).toBeNull();
    });

    it("event: 'occurs' vs 'does not occur'", () => {
      const violation = detectComplementViolation({
        yes: "The event occurs on or before the deadline",
        no: "The event does not occur on or before the deadline",
      });
      expect(violation).toBeNull();
    });

    it("'above' vs 'at or below'", () => {
      const violation = detectComplementViolation({
        yes: "Price is above $50,000 at deadline per CoinGecko",
        no: "Price is at or below $50,000 at deadline per CoinGecko",
      });
      expect(violation).toBeNull();
    });
  });

  describe("the bad example from production", () => {
    it("detects the original BTC normalize bug", () => {
      const violation = detectComplementViolation({
        yes: "The Bitcoin (BTC) price in USD is greater than $100,000.00 at or before 2026-06-01 18:00 UTC according to CoinGecko API",
        no: "The Bitcoin (BTC) price in USD is $100,000.00 or less at 2026-06-01 18:00 UTC according to CoinGecko API",
      });
      expect(violation).toBeTruthy();
      expect(violation).toContain("time range");
    });
  });
});

export { detectComplementViolation };
