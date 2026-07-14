import { describe, expect, it } from "vitest";
import { shouldAdoptChainStatus } from "@/lib/solana/reconciliation";

describe("shouldAdoptChainStatus", () => {
  it("adopts forward on-chain transitions", () => {
    expect(shouldAdoptChainStatus("OPEN", "ACCEPTED")).toBe(true);
    expect(shouldAdoptChainStatus("ACCEPTED", "RESULT_PROPOSED")).toBe(true);
    expect(shouldAdoptChainStatus("RESULT_PROPOSED", "DISPUTED")).toBe(true);
    expect(shouldAdoptChainStatus("DISPUTED", "FINALIZED")).toBe(true);
  });

  it("does not regress application-only resolution or dispute state", () => {
    expect(shouldAdoptChainStatus("RESULT_PROPOSED", "ACCEPTED")).toBe(false);
    expect(shouldAdoptChainStatus("DISPUTED", "ACCEPTED")).toBe(false);
    expect(shouldAdoptChainStatus("DISPUTED", "RESULT_PROPOSED")).toBe(false);
  });

  it("corrects early database state in either direction", () => {
    expect(shouldAdoptChainStatus("ACCEPTED", "OPEN")).toBe(true);
    expect(shouldAdoptChainStatus("OPEN", "ACCEPTED")).toBe(true);
  });

  it("adopts terminal cancellation and refund states", () => {
    expect(shouldAdoptChainStatus("OPEN", "CANCELLED")).toBe(true);
    expect(shouldAdoptChainStatus("ACCEPTED", "REFUNDED")).toBe(true);
    expect(shouldAdoptChainStatus("REFUNDED", "FINALIZED")).toBe(true);
    expect(shouldAdoptChainStatus("FINALIZED", "CANCELLED")).toBe(true);
  });

  it("ignores identical or unknown statuses", () => {
    expect(shouldAdoptChainStatus("ACCEPTED", "ACCEPTED")).toBe(false);
    expect(shouldAdoptChainStatus("ACCEPTED", "UNKNOWN")).toBe(false);
  });
});
