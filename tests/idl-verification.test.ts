import { describe, it, expect, beforeAll } from "vitest";
import { createHash } from "crypto";
import { readFileSync, existsSync } from "fs";
import { resolve } from "path";

const IDL_PATH = resolve(__dirname, "../target/idl/wager_escrow.json");

function anchorDisc(namespace: string, name: string): number[] {
  return Array.from(
    createHash("sha256")
      .update(`${namespace}:${name}`)
      .digest()
      .subarray(0, 8)
  );
}

describe("IDL verification", () => {
  let idl: {
    address: string;
    instructions: Array<{ name: string; discriminator: number[]; accounts: Array<{ name: string }> }>;
    accounts: Array<{ name: string; discriminator: number[] }>;
    types: Array<{ name: string; type: { kind: string; fields?: Array<{ name: string }>; variants?: Array<{ name: string }> } }>;
    errors: Array<{ code: number; name: string }>;
  };

  beforeAll(() => {
    expect(existsSync(IDL_PATH), "IDL file must exist at target/idl/wager_escrow.json").toBe(true);
    idl = JSON.parse(readFileSync(IDL_PATH, "utf8"));
  });

  it("IDL exists and is valid JSON", () => {
    expect(idl.address).toBeTruthy();
    expect(idl.instructions.length).toBe(9);
    expect(idl.accounts.length).toBe(1);
    expect(idl.types.length).toBe(3);
    expect(idl.errors.length).toBe(13);
  });

  describe("instruction discriminators match sha256('global:<name>')[0..8]", () => {
    const expectedInstructions = [
      "initialize_bet",
      "fund_maker",
      "accept_bet",
      "cancel_unaccepted_bet",
      "propose_result",
      "dispute_result",
      "finalize_result_after_dispute_window",
      "admin_finalize_disputed",
      "refund_if_expired_or_unresolved",
    ];

    expectedInstructions.forEach((name) => {
      it(`${name} discriminator`, () => {
        const ix = idl.instructions.find((i) => i.name === name);
        expect(ix, `instruction ${name} must exist in IDL`).toBeTruthy();
        expect(ix!.discriminator).toEqual(anchorDisc("global", name));
      });
    });
  });

  describe("account discriminators match sha256('account:<Name>')[0..8]", () => {
    it("BetAccount discriminator", () => {
      const acc = idl.accounts.find((a) => a.name === "BetAccount");
      expect(acc).toBeTruthy();
      expect(acc!.discriminator).toEqual(anchorDisc("account", "BetAccount"));
    });
  });

  describe("instruction account ordering matches Rust #[derive(Accounts)]", () => {
    it("initialize_bet accounts", () => {
      const ix = idl.instructions.find((i) => i.name === "initialize_bet")!;
      const names = ix.accounts.map((a) => a.name);
      expect(names).toEqual(["bet", "vault", "maker", "resolver_authority", "system_program"]);
    });

    it("fund_maker accounts", () => {
      const ix = idl.instructions.find((i) => i.name === "fund_maker")!;
      expect(ix.accounts.map((a) => a.name)).toEqual(["bet", "vault", "maker", "system_program"]);
    });

    it("accept_bet accounts", () => {
      const ix = idl.instructions.find((i) => i.name === "accept_bet")!;
      expect(ix.accounts.map((a) => a.name)).toEqual(["bet", "vault", "taker", "system_program"]);
    });

    it("cancel_unaccepted_bet accounts", () => {
      const ix = idl.instructions.find((i) => i.name === "cancel_unaccepted_bet")!;
      expect(ix.accounts.map((a) => a.name)).toEqual(["bet", "vault", "maker", "system_program"]);
    });

    it("propose_result accounts", () => {
      const ix = idl.instructions.find((i) => i.name === "propose_result")!;
      expect(ix.accounts.map((a) => a.name)).toEqual(["bet", "resolver_authority"]);
    });

    it("dispute_result accounts", () => {
      const ix = idl.instructions.find((i) => i.name === "dispute_result")!;
      expect(ix.accounts.map((a) => a.name)).toEqual(["bet", "disputer"]);
    });

    it("finalize_result_after_dispute_window accounts", () => {
      const ix = idl.instructions.find((i) => i.name === "finalize_result_after_dispute_window")!;
      expect(ix.accounts.map((a) => a.name)).toEqual(["bet", "vault", "winner", "fee_wallet", "system_program"]);
    });

    it("admin_finalize_disputed accounts", () => {
      const ix = idl.instructions.find((i) => i.name === "admin_finalize_disputed")!;
      expect(ix.accounts.map((a) => a.name)).toEqual(["bet", "vault", "winner", "fee_wallet", "resolver_authority", "system_program"]);
    });

    it("refund_if_expired_or_unresolved accounts", () => {
      const ix = idl.instructions.find((i) => i.name === "refund_if_expired_or_unresolved")!;
      expect(ix.accounts.map((a) => a.name)).toEqual(["bet", "vault", "maker", "taker", "system_program"]);
    });
  });

  describe("BetAccount field layout matches Rust struct", () => {
    it("has all fields in correct order", () => {
      const betType = idl.types.find((t) => t.name === "BetAccount")!;
      expect(betType.type.kind).toBe("struct");
      const fieldNames = betType.type.fields!.map((f) => f.name);
      expect(fieldNames).toEqual([
        "bet_id_hash",
        "maker",
        "taker",
        "allowed_taker",
        "maker_side",
        "stake_lamports",
        "deadline_ts",
        "dispute_deadline_ts",
        "status",
        "proposed_winner",
        "final_winner",
        "resolver_authority",
        "fee_bps",
        "evidence_hash",
        "bump",
        "vault_bump",
      ]);
    });
  });

  describe("enum types match Rust definitions", () => {
    it("BetSide variants", () => {
      const t = idl.types.find((t) => t.name === "BetSide")!;
      expect(t.type.variants!.map((v) => v.name)).toEqual(["Yes", "No"]);
    });

    it("BetStatus variants", () => {
      const t = idl.types.find((t) => t.name === "BetStatus")!;
      expect(t.type.variants!.map((v) => v.name)).toEqual([
        "Open", "Accepted", "ResultProposed", "Disputed", "Finalized", "Cancelled", "Refunded",
      ]);
    });
  });

  describe("error codes match Rust #[error_code]", () => {
    it("error codes are sequential from 6000", () => {
      idl.errors.forEach((err, i) => {
        expect(err.code).toBe(6000 + i);
      });
    });

    it("all expected errors exist", () => {
      const names = idl.errors.map((e) => e.name);
      expect(names).toEqual([
        "InvalidStatus", "Unauthorized", "StakeExceedsMax", "ZeroStake",
        "DeadlinePast", "DeadlineNotReached", "DisputeWindowActive",
        "DisputeWindowExpired", "TakerNotAllowed", "FeeTooHigh",
        "Overflow", "InvalidEvidenceHash", "NotExpiredOrResolved",
      ]);
    });
  });

  it("program ID matches lib.rs declare_id!", () => {
    const libRs = readFileSync(resolve(__dirname, "../programs/wager_escrow/src/lib.rs"), "utf8");
    const match = libRs.match(/declare_id!\("([^"]+)"\)/);
    expect(match).toBeTruthy();
    expect(idl.address).toBe(match![1]);
  });
});
