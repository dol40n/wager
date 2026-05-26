import { describe, it, expect } from "vitest";
import {
  lamportsToSol,
  solToLamports,
  shortenAddress,
  hashEvidence,
  isDeadlinePassed,
  statusLabel,
} from "@/lib/utils";

describe("lamportsToSol", () => {
  it("converts lamports to SOL", () => {
    expect(lamportsToSol(1_000_000_000)).toBe(1);
    expect(lamportsToSol(500_000_000)).toBe(0.5);
    expect(lamportsToSol(0)).toBe(0);
  });

  it("handles bigint", () => {
    expect(lamportsToSol(BigInt(2_000_000_000))).toBe(2);
  });
});

describe("solToLamports", () => {
  it("converts SOL to lamports", () => {
    expect(solToLamports(1)).toBe(1_000_000_000);
    expect(solToLamports(0.5)).toBe(500_000_000);
    expect(solToLamports(0.001)).toBe(1_000_000);
  });
});

describe("shortenAddress", () => {
  it("shortens a pubkey", () => {
    const addr = "7EcDhSYGxXyscszYEp35KHN8vvw3svAuLKTzXwCFLtV";
    expect(shortenAddress(addr)).toBe("7EcD...FLtV");
  });

  it("uses custom char count", () => {
    const addr = "7EcDhSYGxXyscszYEp35KHN8vvw3svAuLKTzXwCFLtV";
    expect(shortenAddress(addr, 6)).toBe("7EcDhS...wCFLtV");
  });
});

describe("hashEvidence", () => {
  it("produces consistent SHA-256 hash", () => {
    const json = JSON.stringify([{ source: "test" }]);
    const hash1 = hashEvidence(json);
    const hash2 = hashEvidence(json);
    expect(hash1.toString("hex")).toBe(hash2.toString("hex"));
    expect(hash1.length).toBe(32);
  });

  it("produces different hash for different input", () => {
    const hash1 = hashEvidence("a");
    const hash2 = hashEvidence("b");
    expect(hash1.toString("hex")).not.toBe(hash2.toString("hex"));
  });
});

describe("isDeadlinePassed", () => {
  it("returns true for past date", () => {
    expect(isDeadlinePassed("2020-01-01T00:00:00Z")).toBe(true);
  });

  it("returns false for future date", () => {
    expect(isDeadlinePassed("2099-01-01T00:00:00Z")).toBe(false);
  });
});

describe("statusLabel", () => {
  it("maps statuses correctly", () => {
    expect(statusLabel("OPEN")).toBe("Open");
    expect(statusLabel("RESULT_PROPOSED")).toBe("Result Proposed");
    expect(statusLabel("FINALIZED")).toBe("Finalized");
  });

  it("returns raw string for unknown status", () => {
    expect(statusLabel("UNKNOWN")).toBe("UNKNOWN");
  });
});
