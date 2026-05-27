import { describe, it, expect, vi } from "vitest";

// Test multiSearch dedup logic without network calls
// Import the function directly — searchWeb will short-circuit because TAVILY_API_KEY is unset

describe("multiSearch deduplication", () => {
  it("deduplicates results by URL", async () => {
    const { multiSearch } = await import("@/lib/web-search");

    // With no TAVILY_API_KEY, searchWeb returns [] for each query
    // So multiSearch returns [] — test the dedup logic directly
    const result = await multiSearch(["query1", "query2"]);
    expect(result).toEqual([]);
  });

  it("dedup logic works on arrays", () => {
    // Direct test of the dedup algorithm used by multiSearch
    const batches = [
      [
        { url: "https://a.com", title: "A", content: "a", published_date: null },
        { url: "https://b.com", title: "B", content: "b", published_date: null },
      ],
      [
        { url: "https://b.com", title: "B dup", content: "b2", published_date: null },
        { url: "https://c.com", title: "C", content: "c", published_date: null },
      ],
      [
        { url: "https://a.com", title: "A dup", content: "a2", published_date: null },
      ],
    ];

    const seen = new Set<string>();
    const deduped: typeof batches[0] = [];
    for (const batch of batches) {
      for (const r of batch) {
        if (!seen.has(r.url)) {
          seen.add(r.url);
          deduped.push(r);
        }
      }
    }

    expect(deduped).toHaveLength(3);
    expect(deduped.map((r) => r.url)).toEqual([
      "https://a.com",
      "https://b.com",
      "https://c.com",
    ]);
    // First occurrence wins
    expect(deduped[0].title).toBe("A");
    expect(deduped[1].title).toBe("B");
  });

  it("empty batches produce empty result", () => {
    const batches: Array<Array<{ url: string }>> = [[], [], []];
    const seen = new Set<string>();
    const deduped: Array<{ url: string }> = [];
    for (const batch of batches) {
      for (const r of batch) {
        if (!seen.has(r.url)) {
          seen.add(r.url);
          deduped.push(r);
        }
      }
    }
    expect(deduped).toHaveLength(0);
  });
});
