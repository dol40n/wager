import { describe, it, expect } from "vitest";

// Test post-hoc validation rules without AI calls
// Mirrors the flag logic in resolveWager

interface Evidence {
  source_url: string;
  supports: "YES" | "NO" | "NEUTRAL";
}

function validateResolution(params: {
  winnerSide: string;
  confidence: number;
  evidence: Evidence[];
  searchUrls: string[];
  deadlinePassed: boolean;
}): string[] {
  const flags: string[] = [];
  const searchUrlSet = new Set(params.searchUrls);

  if (params.confidence < 0.8) {
    flags.push(`low-confidence:${params.confidence}`);
  }

  const yesCount = params.evidence.filter((e) => e.supports === "YES").length;
  const noCount = params.evidence.filter((e) => e.supports === "NO").length;
  if (yesCount > 0 && noCount > 0) {
    flags.push(`conflicting-evidence:${yesCount}Y/${noCount}N`);
  }

  if (params.evidence.some((e) => !e.source_url)) {
    flags.push("empty-source-url");
  }

  const hallucinated = params.evidence.filter(
    (e) => e.source_url && !searchUrlSet.has(e.source_url) && params.searchUrls.length > 0
  );
  if (hallucinated.length > 0) {
    flags.push(`hallucinated-urls:${hallucinated.length}`);
  }

  if (!params.deadlinePassed && params.winnerSide !== "UNKNOWN") {
    flags.push("verdict-before-deadline");
  }

  if (params.winnerSide !== "UNKNOWN" && params.evidence.length > 0) {
    const supporting = params.evidence.filter((e) => e.supports === params.winnerSide).length;
    const opposing = params.evidence.filter(
      (e) => e.supports !== "NEUTRAL" && e.supports !== params.winnerSide
    ).length;
    if (opposing > supporting) {
      flags.push(`winner-evidence-mismatch:${supporting}for/${opposing}against`);
    }
  }

  if (params.confidence >= 0.8 && params.evidence.length === 0) {
    flags.push("high-confidence-no-evidence");
  }

  const urlSupports = new Map<string, Set<string>>();
  for (const e of params.evidence) {
    if (!e.source_url) continue;
    if (!urlSupports.has(e.source_url)) urlSupports.set(e.source_url, new Set());
    urlSupports.get(e.source_url)!.add(e.supports);
  }
  for (const [, supports] of urlSupports) {
    if (supports.size > 1) flags.push("self-contradicting-url");
  }

  return flags;
}

const base = {
  winnerSide: "YES" as string,
  confidence: 0.9,
  evidence: [
    { source_url: "https://a.com", supports: "YES" as const },
  ],
  searchUrls: ["https://a.com"],
  deadlinePassed: true,
};

describe("post-hoc validation — clean resolution", () => {
  it("no flags for valid resolution", () => {
    expect(validateResolution(base)).toEqual([]);
  });
});

describe("post-hoc validation — low confidence", () => {
  it("flags confidence < 0.8", () => {
    const flags = validateResolution({ ...base, confidence: 0.6 });
    expect(flags).toContain("low-confidence:0.6");
  });

  it("does not flag confidence = 0.8", () => {
    const flags = validateResolution({ ...base, confidence: 0.8 });
    expect(flags.find((f) => f.startsWith("low-confidence"))).toBeUndefined();
  });
});

describe("post-hoc validation — conflicting evidence", () => {
  it("flags when both YES and NO evidence exist", () => {
    const flags = validateResolution({
      ...base,
      evidence: [
        { source_url: "https://a.com", supports: "YES" },
        { source_url: "https://b.com", supports: "NO" },
      ],
      searchUrls: ["https://a.com", "https://b.com"],
    });
    expect(flags).toContain("conflicting-evidence:1Y/1N");
  });

  it("does not flag YES + NEUTRAL", () => {
    const flags = validateResolution({
      ...base,
      evidence: [
        { source_url: "https://a.com", supports: "YES" },
        { source_url: "https://b.com", supports: "NEUTRAL" },
      ],
      searchUrls: ["https://a.com", "https://b.com"],
    });
    expect(flags.find((f) => f.startsWith("conflicting"))).toBeUndefined();
  });
});

describe("post-hoc validation — hallucinated URLs", () => {
  it("flags URLs not in search results", () => {
    const flags = validateResolution({
      ...base,
      evidence: [
        { source_url: "https://fake.com/made-up", supports: "YES" },
      ],
      searchUrls: ["https://real.com"],
    });
    expect(flags).toContain("hallucinated-urls:1");
  });

  it("does not flag when search results are empty (no baseline)", () => {
    const flags = validateResolution({
      ...base,
      evidence: [
        { source_url: "https://anything.com", supports: "YES" },
      ],
      searchUrls: [],
    });
    expect(flags.find((f) => f.startsWith("hallucinated"))).toBeUndefined();
  });

  it("does not flag URLs that match search results", () => {
    const flags = validateResolution(base);
    expect(flags.find((f) => f.startsWith("hallucinated"))).toBeUndefined();
  });
});

describe("post-hoc validation — deadline", () => {
  it("flags verdict before deadline passes", () => {
    const flags = validateResolution({ ...base, deadlinePassed: false });
    expect(flags).toContain("verdict-before-deadline");
  });

  it("allows UNKNOWN before deadline", () => {
    const flags = validateResolution({ ...base, winnerSide: "UNKNOWN", deadlinePassed: false });
    expect(flags.find((f) => f === "verdict-before-deadline")).toBeUndefined();
  });
});

describe("post-hoc validation — winner-evidence mismatch", () => {
  it("flags when more evidence opposes the verdict", () => {
    const flags = validateResolution({
      ...base,
      winnerSide: "YES",
      evidence: [
        { source_url: "https://a.com", supports: "NO" },
        { source_url: "https://b.com", supports: "NO" },
        { source_url: "https://c.com", supports: "YES" },
      ],
      searchUrls: ["https://a.com", "https://b.com", "https://c.com"],
    });
    expect(flags.find((f) => f.startsWith("winner-evidence-mismatch"))).toBeDefined();
  });

  it("does not flag when evidence supports the verdict", () => {
    const flags = validateResolution({
      ...base,
      evidence: [
        { source_url: "https://a.com", supports: "YES" },
        { source_url: "https://b.com", supports: "YES" },
      ],
      searchUrls: ["https://a.com", "https://b.com"],
    });
    expect(flags.find((f) => f.startsWith("winner-evidence-mismatch"))).toBeUndefined();
  });
});

describe("post-hoc validation — high confidence no evidence", () => {
  it("flags high confidence with empty evidence", () => {
    const flags = validateResolution({ ...base, evidence: [], confidence: 0.95 });
    expect(flags).toContain("high-confidence-no-evidence");
  });

  it("does not flag low confidence with empty evidence", () => {
    const flags = validateResolution({ ...base, evidence: [], confidence: 0.5 });
    expect(flags.find((f) => f === "high-confidence-no-evidence")).toBeUndefined();
  });
});

describe("post-hoc validation — self-contradicting URL", () => {
  it("flags same URL with different supports", () => {
    const flags = validateResolution({
      ...base,
      evidence: [
        { source_url: "https://a.com", supports: "YES" },
        { source_url: "https://a.com", supports: "NO" },
      ],
      searchUrls: ["https://a.com"],
    });
    expect(flags).toContain("self-contradicting-url");
  });

  it("does not flag same URL same supports", () => {
    const flags = validateResolution({
      ...base,
      evidence: [
        { source_url: "https://a.com", supports: "YES" },
        { source_url: "https://a.com", supports: "YES" },
      ],
      searchUrls: ["https://a.com"],
    });
    expect(flags.find((f) => f === "self-contradicting-url")).toBeUndefined();
  });
});

describe("post-hoc validation — multiple flags", () => {
  it("catches multiple issues at once", () => {
    const flags = validateResolution({
      winnerSide: "YES",
      confidence: 0.6,
      evidence: [
        { source_url: "", supports: "NO" },
        { source_url: "https://fake.com", supports: "YES" },
      ],
      searchUrls: ["https://real.com"],
      deadlinePassed: false,
    });
    expect(flags.length).toBeGreaterThanOrEqual(3);
    expect(flags).toContain("low-confidence:0.6");
    expect(flags).toContain("verdict-before-deadline");
    expect(flags).toContain("empty-source-url");
  });
});
