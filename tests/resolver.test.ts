import { describe, it, expect } from "vitest";
import { canonicalizeEvidence } from "@/lib/ai/resolver";
import { hashEvidence } from "@/lib/utils";
import type { EvidenceItem } from "@/types";

describe("canonicalizeEvidence", () => {
  const evidenceA: EvidenceItem = {
    source_url: "https://a.com",
    source_name: "Source A",
    published_or_observed_at: "2026-01-01T00:00:00Z",
    relevant_excerpt: "Alpha",
    supports: "YES",
    explanation: "Supports YES",
  };
  const evidenceB: EvidenceItem = {
    source_url: "https://b.com",
    source_name: "Source B",
    published_or_observed_at: null,
    relevant_excerpt: "Beta",
    supports: "NO",
    explanation: "Supports NO",
  };

  it("produces deterministic output regardless of input order", () => {
    const json1 = canonicalizeEvidence([evidenceA, evidenceB]);
    const json2 = canonicalizeEvidence([evidenceB, evidenceA]);
    expect(json1).to.equal(json2);
  });

  it("hash is deterministic for same evidence", () => {
    const json1 = canonicalizeEvidence([evidenceA, evidenceB]);
    const json2 = canonicalizeEvidence([evidenceB, evidenceA]);
    const hash1 = hashEvidence(json1).toString("hex");
    const hash2 = hashEvidence(json2).toString("hex");
    expect(hash1).to.equal(hash2);
  });

  it("hash differs for different evidence", () => {
    const json1 = canonicalizeEvidence([evidenceA]);
    const json2 = canonicalizeEvidence([evidenceB]);
    const hash1 = hashEvidence(json1).toString("hex");
    const hash2 = hashEvidence(json2).toString("hex");
    expect(hash1).not.to.equal(hash2);
  });

  it("sorts by source_url", () => {
    const result = canonicalizeEvidence([evidenceB, evidenceA]);
    const parsed = JSON.parse(result);
    expect(parsed[0].source_url).to.equal("https://a.com");
    expect(parsed[1].source_url).to.equal("https://b.com");
  });

  it("empty array produces empty JSON array", () => {
    expect(canonicalizeEvidence([])).to.equal("[]");
  });
});
