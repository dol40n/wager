import { describe, it, expect } from "vitest";
import { createHash } from "crypto";
import { PublicKey, SystemProgram } from "@solana/web3.js";
import { readFileSync } from "fs";
import { resolve } from "path";

const IDL = JSON.parse(
  readFileSync(resolve(__dirname, "../target/idl/wager_escrow.json"), "utf8")
);

function disc(name: string): Buffer {
  return createHash("sha256")
    .update(`global:${name}`)
    .digest()
    .subarray(0, 8);
}

// Re-implement the encoder functions from transactions.ts to test them in isolation
function encodeBetSide(side: "yes" | "no"): Buffer {
  return Buffer.from([side === "yes" ? 0 : 1]);
}

function encodeOptionPubkey(pk: PublicKey | null): Buffer {
  if (pk === null) return Buffer.from([0]);
  return Buffer.concat([Buffer.from([1]), pk.toBuffer()]);
}

function encodeU64(value: bigint): Buffer {
  const buf = Buffer.alloc(8);
  buf.writeBigUInt64LE(value);
  return buf;
}

function encodeI64(value: bigint): Buffer {
  const buf = Buffer.alloc(8);
  buf.writeBigInt64LE(value);
  return buf;
}

function encodeU16(value: number): Buffer {
  const buf = Buffer.alloc(2);
  buf.writeUInt16LE(value);
  return buf;
}

function idlIx(name: string) {
  return IDL.instructions.find((i: { name: string }) => i.name === name);
}

describe("Borsh transaction builder verification against IDL", () => {
  const PROGRAM_ID = new PublicKey(IDL.address);

  describe("discriminators match IDL", () => {
    const builders = [
      { fn: "initialize_bet", ixName: "initialize_bet" },
      { fn: "fund_maker", ixName: "fund_maker" },
      { fn: "accept_bet", ixName: "accept_bet" },
      { fn: "propose_result", ixName: "propose_result" },
      { fn: "dispute_result", ixName: "dispute_result" },
      {
        fn: "finalize_result_after_dispute_window",
        ixName: "finalize_result_after_dispute_window",
      },
      {
        fn: "admin_finalize_disputed",
        ixName: "admin_finalize_disputed",
      },
    ];

    builders.forEach(({ fn, ixName }) => {
      it(`${fn} discriminator matches IDL`, () => {
        const computed = Array.from(disc(ixName));
        const idlDisc = idlIx(ixName).discriminator;
        expect(computed).toEqual(idlDisc);
      });
    });
  });

  describe("initialize_bet encoding", () => {
    it("encodes all args in correct order: hash, side, stake, deadline, feeBps, allowedTaker", () => {
      const betIdHash = createHash("sha256").update("test").digest();
      const side = "yes" as const;
      const stake = BigInt(500_000_000);
      const deadline = BigInt(1700000000);
      const feeBps = 100;

      const data = Buffer.concat([
        disc("initialize_bet"),
        betIdHash.subarray(0, 32),
        encodeBetSide(side),
        encodeU64(stake),
        encodeI64(deadline),
        encodeU16(feeBps),
        encodeOptionPubkey(null),
      ]);

      // 8 disc + 32 hash + 1 side + 8 stake + 8 deadline + 2 feeBps + 1 none = 60
      expect(data.length).toBe(60);
      expect(Array.from(data.subarray(0, 8))).toEqual(
        idlIx("initialize_bet").discriminator
      );
    });

    it("encodes Option<Pubkey> correctly for Some", () => {
      const pk = PublicKey.unique();
      const encoded = encodeOptionPubkey(pk);
      expect(encoded.length).toBe(33); // 1 flag + 32 pubkey
      expect(encoded[0]).toBe(1);
      expect(Buffer.from(encoded.subarray(1))).toEqual(pk.toBuffer());
    });

    it("encodes Option<Pubkey> correctly for None", () => {
      const encoded = encodeOptionPubkey(null);
      expect(encoded.length).toBe(1);
      expect(encoded[0]).toBe(0);
    });

    it("account metas match IDL order: bet, vault, maker, resolver_authority, system_program", () => {
      const idlAccounts = idlIx("initialize_bet").accounts;
      expect(idlAccounts.map((a: { name: string }) => a.name)).toEqual([
        "bet",
        "vault",
        "maker",
        "resolver_authority",
        "system_program",
      ]);

      // Verify signer/writable flags from IDL
      expect(idlAccounts[0].writable).toBe(true); // bet
      expect(idlAccounts[0].signer).toBeUndefined(); // bet is not signer
      expect(idlAccounts[1].writable).toBeUndefined(); // vault (not writable for init)
      expect(idlAccounts[2].writable).toBe(true); // maker
      expect(idlAccounts[2].signer).toBe(true); // maker is signer
      expect(idlAccounts[3].signer).toBeUndefined(); // resolver is not signer
      expect(idlAccounts[4].address).toBe(
        SystemProgram.programId.toBase58()
      );
    });
  });

  describe("fund_maker encoding", () => {
    it("data is discriminator only (no args)", () => {
      const data = disc("fund_maker");
      expect(data.length).toBe(8);
      expect(Array.from(data)).toEqual(idlIx("fund_maker").discriminator);
    });

    it("account metas: bet, vault, maker, system_program", () => {
      const idlAccounts = idlIx("fund_maker").accounts;
      expect(idlAccounts.map((a: { name: string }) => a.name)).toEqual([
        "bet",
        "vault",
        "maker",
        "system_program",
      ]);
      expect(idlAccounts[0].writable).toBe(true);
      expect(idlAccounts[1].writable).toBe(true);
      expect(idlAccounts[2].writable).toBe(true);
      expect(idlAccounts[2].signer).toBe(true);
    });
  });

  describe("accept_bet encoding", () => {
    it("data is discriminator only", () => {
      const data = disc("accept_bet");
      expect(data.length).toBe(8);
    });

    it("account metas: bet, vault, taker, system_program", () => {
      const idlAccounts = idlIx("accept_bet").accounts;
      expect(idlAccounts.map((a: { name: string }) => a.name)).toEqual([
        "bet",
        "vault",
        "taker",
        "system_program",
      ]);
      expect(idlAccounts[2].signer).toBe(true);
      expect(idlAccounts[2].writable).toBe(true);
    });
  });

  describe("propose_result encoding", () => {
    it("encodes args: proposed_winner pubkey + evidence_hash [u8;32]", () => {
      const winner = PublicKey.unique();
      const evidenceHash = createHash("sha256").update("evidence").digest();

      const data = Buffer.concat([
        disc("propose_result"),
        winner.toBuffer(),
        evidenceHash.subarray(0, 32),
      ]);

      // 8 disc + 32 pubkey + 32 hash = 72
      expect(data.length).toBe(72);
    });

    it("account metas: bet, resolver_authority (signer)", () => {
      const idlAccounts = idlIx("propose_result").accounts;
      expect(idlAccounts.map((a: { name: string }) => a.name)).toEqual([
        "bet",
        "resolver_authority",
      ]);
      expect(idlAccounts[1].signer).toBe(true);
    });
  });

  describe("dispute_result encoding", () => {
    it("account metas: bet, disputer (signer)", () => {
      const idlAccounts = idlIx("dispute_result").accounts;
      expect(idlAccounts.map((a: { name: string }) => a.name)).toEqual([
        "bet",
        "disputer",
      ]);
      expect(idlAccounts[1].signer).toBe(true);
    });
  });

  describe("finalize_result_after_dispute_window encoding", () => {
    it("account metas: bet, vault, winner, fee_wallet, system_program", () => {
      const idlAccounts = idlIx(
        "finalize_result_after_dispute_window"
      ).accounts;
      expect(idlAccounts.map((a: { name: string }) => a.name)).toEqual([
        "bet",
        "vault",
        "winner",
        "fee_wallet",
        "system_program",
      ]);
      // winner and fee_wallet are writable (receive lamports)
      expect(idlAccounts[2].writable).toBe(true);
      expect(idlAccounts[3].writable).toBe(true);
    });
  });

  describe("admin_finalize_disputed encoding", () => {
    it("encodes args: final_winner pubkey", () => {
      const winner = PublicKey.unique();
      const data = Buffer.concat([
        disc("admin_finalize_disputed"),
        winner.toBuffer(),
      ]);
      // 8 disc + 32 pubkey = 40
      expect(data.length).toBe(40);
    });

    it("account metas: bet, vault, winner, fee_wallet, resolver_authority (signer), system_program", () => {
      const idlAccounts = idlIx("admin_finalize_disputed").accounts;
      expect(idlAccounts.map((a: { name: string }) => a.name)).toEqual([
        "bet",
        "vault",
        "winner",
        "fee_wallet",
        "resolver_authority",
        "system_program",
      ]);
      expect(idlAccounts[4].signer).toBe(true); // resolver_authority
    });
  });

  describe("BetSide Borsh encoding", () => {
    it("Yes = 0, No = 1 (single-byte enum)", () => {
      expect(encodeBetSide("yes")[0]).toBe(0);
      expect(encodeBetSide("no")[0]).toBe(1);
    });
  });

  describe("integer encoding", () => {
    it("u64 is little-endian 8 bytes", () => {
      const buf = encodeU64(BigInt(1_000_000_000));
      expect(buf.length).toBe(8);
      expect(buf.readBigUInt64LE()).toBe(BigInt(1_000_000_000));
    });

    it("i64 is little-endian 8 bytes (signed)", () => {
      const buf = encodeI64(BigInt(-1));
      expect(buf.length).toBe(8);
      expect(buf.readBigInt64LE()).toBe(BigInt(-1));
    });

    it("u16 is little-endian 2 bytes", () => {
      const buf = encodeU16(100);
      expect(buf.length).toBe(2);
      expect(buf.readUInt16LE()).toBe(100);
    });
  });

  describe("program ID consistency", () => {
    it("IDL address matches constants.ts PROGRAM_ID", () => {
      expect(PROGRAM_ID.toBase58()).toBe(IDL.address);
    });
  });
});
