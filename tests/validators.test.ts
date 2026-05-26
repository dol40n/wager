import { describe, it, expect } from "vitest";
import {
  normalizeRequestSchema,
  createBetSchema,
  disputeSchema,
  adminFinalizeSchema,
} from "@/lib/validators";

describe("normalizeRequestSchema", () => {
  it("accepts valid input", () => {
    const result = normalizeRequestSchema.parse({
      text: "Bitcoin will be above $100k by June 2026",
    });
    expect(result.text).toBe("Bitcoin will be above $100k by June 2026");
  });

  it("rejects short text", () => {
    expect(() => normalizeRequestSchema.parse({ text: "short" })).toThrow();
  });

  it("accepts optional deadline", () => {
    const result = normalizeRequestSchema.parse({
      text: "Bitcoin will be above $100k by June 2026",
      deadline_utc: "2026-06-01T00:00:00Z",
    });
    expect(result.deadline_utc).toBe("2026-06-01T00:00:00Z");
  });
});

describe("createBetSchema", () => {
  const validBet = {
    original_text: "Bitcoin above 100k by June",
    normalized_question: "Will Bitcoin price exceed $100,000 USD on CoinGecko by June 1, 2026 00:00 UTC?",
    category: "crypto" as const,
    yes_definition: "BTC >= $100,000 on CoinGecko at June 1, 2026 00:00 UTC",
    no_definition: "BTC < $100,000 on CoinGecko at June 1, 2026 00:00 UTC",
    deadline_utc: "2026-06-01T00:00:00Z",
    resolution_sources: ["coingecko.com"],
    resolution_method: "api" as const,
    objective_criteria: ["CoinGecko BTC/USD price at deadline"],
    ambiguity_score: 0.05,
    ambiguity_notes: [],
    maker_side: "YES" as const,
    stake_lamports: 100_000_000,
    maker_pubkey: "7EcDhSYGxXyscszYEp35KHN8vvw3svAuLKTzXwCFLtV",
  };

  it("accepts valid bet", () => {
    const result = createBetSchema.parse(validBet);
    expect(result.stake_lamports).toBe(100_000_000);
  });

  it("rejects stake above max", () => {
    expect(() =>
      createBetSchema.parse({ ...validBet, stake_lamports: 20_000_000_000 })
    ).toThrow();
  });

  it("rejects zero stake", () => {
    expect(() =>
      createBetSchema.parse({ ...validBet, stake_lamports: 0 })
    ).toThrow();
  });

  it("rejects invalid category", () => {
    expect(() =>
      createBetSchema.parse({ ...validBet, category: "invalid" })
    ).toThrow();
  });

  it("defaults fee_bps to 100 (1%)", () => {
    const result = createBetSchema.parse(validBet);
    expect(result.fee_bps).toBe(100);
  });
});

describe("disputeSchema", () => {
  it("accepts valid dispute", () => {
    const result = disputeSchema.parse({
      wallet_pubkey: "7EcDhSYGxXyscszYEp35KHN8vvw3svAuLKTzXwCFLtV",
      reason: "The evidence cited is from a wrong date and doesn't apply",
    });
    expect(result.reason.length).toBeGreaterThan(10);
  });

  it("rejects short reason", () => {
    expect(() =>
      disputeSchema.parse({
        wallet_pubkey: "7EcDhSYGxXyscszYEp35KHN8vvw3svAuLKTzXwCFLtV",
        reason: "no",
      })
    ).toThrow();
  });
});

describe("adminFinalizeSchema", () => {
  it("accepts YES", () => {
    const result = adminFinalizeSchema.parse({ winner_side: "YES" });
    expect(result.winner_side).toBe("YES");
  });

  it("accepts NO", () => {
    const result = adminFinalizeSchema.parse({ winner_side: "NO" });
    expect(result.winner_side).toBe("NO");
  });

  it("rejects invalid side", () => {
    expect(() =>
      adminFinalizeSchema.parse({ winner_side: "DRAW" })
    ).toThrow();
  });
});
