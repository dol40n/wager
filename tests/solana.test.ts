import { describe, it, expect } from "vitest";
import { PublicKey } from "@solana/web3.js";
import { computeBetIdHash, deriveBetPDA, deriveVaultPDA } from "@/lib/solana/program";

describe("computeBetIdHash", () => {
  it("returns a 32-byte buffer", () => {
    const hash = computeBetIdHash("test-bet-id");
    expect(hash.length).toBe(32);
  });

  it("is deterministic", () => {
    const h1 = computeBetIdHash("abc");
    const h2 = computeBetIdHash("abc");
    expect(h1.toString("hex")).toBe(h2.toString("hex"));
  });

  it("differs for different inputs", () => {
    const h1 = computeBetIdHash("abc");
    const h2 = computeBetIdHash("xyz");
    expect(h1.toString("hex")).not.toBe(h2.toString("hex"));
  });
});

describe("deriveBetPDA", () => {
  it("returns a valid PublicKey and bump", () => {
    const hash = computeBetIdHash("test-bet");
    const [pda, bump] = deriveBetPDA(hash);
    expect(pda).toBeInstanceOf(PublicKey);
    expect(bump).toBeGreaterThanOrEqual(0);
    expect(bump).toBeLessThanOrEqual(255);
  });

  it("is deterministic", () => {
    const hash = computeBetIdHash("test-bet");
    const [pda1] = deriveBetPDA(hash);
    const [pda2] = deriveBetPDA(hash);
    expect(pda1.toBase58()).toBe(pda2.toBase58());
  });
});

describe("deriveVaultPDA", () => {
  it("derives vault from bet PDA", () => {
    const hash = computeBetIdHash("test-bet");
    const [betPDA] = deriveBetPDA(hash);
    const [vaultPDA, bump] = deriveVaultPDA(betPDA);
    expect(vaultPDA).toBeInstanceOf(PublicKey);
    expect(bump).toBeGreaterThanOrEqual(0);
    expect(vaultPDA.toBase58()).not.toBe(betPDA.toBase58());
  });
});
