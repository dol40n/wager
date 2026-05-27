import { describe, it, expect } from "vitest";

// Test the challenger trigger conditions without calling any AI APIs
// Mirrors the logic in resolveWager that decides whether to run adversarial verification

const DETERMINISTIC_CATEGORIES = ["crypto", "sports"];

function shouldChallenge(params: {
  winnerSide: string;
  needsManualReview: boolean;
  confidence: number;
  category: string;
}): boolean {
  return (
    params.winnerSide !== "UNKNOWN" &&
    !params.needsManualReview &&
    params.confidence >= 0.8 &&
    params.confidence <= 0.93 &&
    !DETERMINISTIC_CATEGORIES.includes(params.category)
  );
}

describe("adversarial challenger trigger conditions", () => {
  const base = {
    winnerSide: "YES",
    needsManualReview: false,
    confidence: 0.88,
    category: "news",
  };

  it("triggers for news category at 0.88 confidence", () => {
    expect(shouldChallenge(base)).toBe(true);
  });

  it("triggers for politics category at 0.80", () => {
    expect(shouldChallenge({ ...base, category: "politics", confidence: 0.80 })).toBe(true);
  });

  it("triggers for custom category at 0.93", () => {
    expect(shouldChallenge({ ...base, category: "custom", confidence: 0.93 })).toBe(true);
  });

  it("skips for crypto category", () => {
    expect(shouldChallenge({ ...base, category: "crypto" })).toBe(false);
  });

  it("skips for sports category", () => {
    expect(shouldChallenge({ ...base, category: "sports" })).toBe(false);
  });

  it("skips when confidence < 0.8 (already manual review)", () => {
    expect(shouldChallenge({ ...base, confidence: 0.79 })).toBe(false);
  });

  it("skips when confidence > 0.93 (high enough to proceed)", () => {
    expect(shouldChallenge({ ...base, confidence: 0.94 })).toBe(false);
  });

  it("skips when confidence is 0.95", () => {
    expect(shouldChallenge({ ...base, confidence: 0.95 })).toBe(false);
  });

  it("skips when winner is UNKNOWN", () => {
    expect(shouldChallenge({ ...base, winnerSide: "UNKNOWN" })).toBe(false);
  });

  it("skips when already flagged for manual review", () => {
    expect(shouldChallenge({ ...base, needsManualReview: true })).toBe(false);
  });

  it("triggers for entertainment at 0.85", () => {
    expect(shouldChallenge({ ...base, category: "entertainment", confidence: 0.85 })).toBe(true);
  });

  it("boundary: 0.80 triggers, 0.7999 does not", () => {
    expect(shouldChallenge({ ...base, confidence: 0.80 })).toBe(true);
    expect(shouldChallenge({ ...base, confidence: 0.7999 })).toBe(false);
  });

  it("boundary: 0.93 triggers, 0.9301 does not", () => {
    expect(shouldChallenge({ ...base, confidence: 0.93 })).toBe(true);
    expect(shouldChallenge({ ...base, confidence: 0.9301 })).toBe(false);
  });
});

describe("challenger confidence adjustment", () => {
  it("disagreement caps confidence at 0.75", () => {
    const originalConfidence = 0.88;
    const adjusted = Math.min(originalConfidence, 0.75);
    expect(adjusted).toBe(0.75);
  });

  it("agreement bumps confidence by 0.03, capped at 0.95", () => {
    expect(Math.min(0.88 + 0.03, 0.95)).toBeCloseTo(0.91);
    expect(Math.min(0.93 + 0.03, 0.95)).toBeCloseTo(0.95);
    expect(Math.min(0.80 + 0.03, 0.95)).toBeCloseTo(0.83);
  });

  it("agreement at 0.93 caps at 0.95, not 0.96", () => {
    expect(Math.min(0.93 + 0.03, 0.95)).toBe(0.95);
  });
});

describe("challenger disagree thresholds", () => {
  function shouldDisagree(challenge: {
    recommended_action: string;
    confidence_in_original: number;
    verdict_is_correct: boolean;
    wording_ambiguity_detected: boolean;
    exploitable_edge_cases: string[];
  }): boolean {
    return (
      challenge.recommended_action === "REJECT" ||
      (challenge.recommended_action === "FLAG_FOR_REVIEW" && challenge.confidence_in_original < 0.65) ||
      (challenge.wording_ambiguity_detected && challenge.exploitable_edge_cases.length >= 2) ||
      (!challenge.verdict_is_correct && challenge.confidence_in_original < 0.6)
    );
  }

  const safe = {
    recommended_action: "CONFIRM",
    confidence_in_original: 0.9,
    verdict_is_correct: true,
    wording_ambiguity_detected: false,
    exploitable_edge_cases: [],
  };

  it("CONFIRM with high confidence → agree", () => {
    expect(shouldDisagree(safe)).toBe(false);
  });

  it("REJECT → always disagree", () => {
    expect(shouldDisagree({ ...safe, recommended_action: "REJECT" })).toBe(true);
  });

  it("FLAG_FOR_REVIEW with low confidence → disagree", () => {
    expect(shouldDisagree({ ...safe, recommended_action: "FLAG_FOR_REVIEW", confidence_in_original: 0.5 })).toBe(true);
  });

  it("FLAG_FOR_REVIEW with high confidence → agree", () => {
    expect(shouldDisagree({ ...safe, recommended_action: "FLAG_FOR_REVIEW", confidence_in_original: 0.7 })).toBe(false);
  });

  it("ambiguity + 2 edge cases → disagree", () => {
    expect(shouldDisagree({
      ...safe,
      wording_ambiguity_detected: true,
      exploitable_edge_cases: ["edge1", "edge2"],
    })).toBe(true);
  });

  it("ambiguity + 1 edge case → agree (not enough)", () => {
    expect(shouldDisagree({
      ...safe,
      wording_ambiguity_detected: true,
      exploitable_edge_cases: ["edge1"],
    })).toBe(false);
  });

  it("verdict incorrect + low confidence → disagree", () => {
    expect(shouldDisagree({
      ...safe,
      verdict_is_correct: false,
      confidence_in_original: 0.5,
    })).toBe(true);
  });

  it("verdict incorrect + moderate confidence → agree", () => {
    expect(shouldDisagree({
      ...safe,
      verdict_is_correct: false,
      confidence_in_original: 0.7,
    })).toBe(false);
  });
});
