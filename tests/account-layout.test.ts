import { describe, it, expect } from "vitest";
import { Keypair } from "@solana/web3.js";
import {
  parseBetAccount,
  readBetStatus,
  BET_STATUS_DB,
  BET_STATUS_NAMES,
} from "@/lib/solana/account-layout";

function buildAccount(opts: {
  maker: Buffer;
  taker?: Buffer | null;
  allowedTaker?: Buffer | null;
  makerSide?: number;
  stakeLamports?: bigint;
  deadlineTs?: bigint;
  disputeDeadlineTs?: bigint;
  statusByte: number;
}): Buffer {
  const discriminator = Buffer.alloc(8, 0xaa);
  const betIdHash = Buffer.alloc(32, 0xbb);

  const option = (pk?: Buffer | null) =>
    pk ? Buffer.concat([Buffer.from([1]), pk]) : Buffer.from([0]);

  const u64 = (v: bigint) => {
    const b = Buffer.alloc(8);
    b.writeBigUInt64LE(v);
    return b;
  };
  const i64 = (v: bigint) => {
    const b = Buffer.alloc(8);
    b.writeBigInt64LE(v);
    return b;
  };

  return Buffer.concat([
    discriminator,
    betIdHash,
    opts.maker,
    option(opts.taker),
    option(opts.allowedTaker),
    Buffer.from([opts.makerSide ?? 0]),
    u64(opts.stakeLamports ?? BigInt(0)),
    i64(opts.deadlineTs ?? BigInt(0)),
    i64(opts.disputeDeadlineTs ?? BigInt(0)),
    Buffer.from([opts.statusByte]),
    // trailing fields (ignored by parser)
    Buffer.from([0]), // proposed_winner None
    Buffer.from([0]), // final_winner None
    Buffer.alloc(32, 0xff), // resolver_authority
    Buffer.alloc(2, 0), // fee_bps
    Buffer.alloc(32, 0), // evidence_hash
    Buffer.from([255]), // bump
    Buffer.from([254]), // vault_bump
  ]);
}

describe("parseBetAccount", () => {
  it("decodes all fields with taker + allowedTaker present", () => {
    const maker = Keypair.generate().publicKey;
    const taker = Keypair.generate().publicKey;
    const allowed = Keypair.generate().publicKey;
    const data = buildAccount({
      maker: maker.toBuffer(),
      taker: taker.toBuffer(),
      allowedTaker: allowed.toBuffer(),
      makerSide: 1,
      stakeLamports: BigInt(1_500_000_000),
      deadlineTs: BigInt(1_900_000_000),
      disputeDeadlineTs: BigInt(1_900_086_400),
      statusByte: 3,
    });

    const parsed = parseBetAccount(data);
    expect(parsed.maker).toBe(maker.toBase58());
    expect(parsed.taker).toBe(taker.toBase58());
    expect(parsed.allowedTaker).toBe(allowed.toBase58());
    expect(parsed.makerSide).toBe(1);
    expect(parsed.stakeLamports).toBe(BigInt(1_500_000_000));
    expect(parsed.deadlineTs).toBe(BigInt(1_900_000_000));
    expect(parsed.disputeDeadlineTs).toBe(BigInt(1_900_086_400));
    expect(parsed.status).toBe(3);
  });

  it("decodes status + taker correctly when options are None (offset shift)", () => {
    const maker = Keypair.generate().publicKey;
    const data = buildAccount({
      maker: maker.toBuffer(),
      taker: null,
      allowedTaker: null,
      stakeLamports: BigInt(500_000_000),
      statusByte: 0,
    });

    const parsed = parseBetAccount(data);
    expect(parsed.maker).toBe(maker.toBase58());
    expect(parsed.taker).toBeNull();
    expect(parsed.allowedTaker).toBeNull();
    expect(parsed.stakeLamports).toBe(BigInt(500_000_000));
    expect(parsed.status).toBe(0);
  });

  it("handles all 4 Option combinations and reads the same status", () => {
    const maker = Keypair.generate().publicKey.toBuffer();
    const pk = Keypair.generate().publicKey.toBuffer();
    const combos: [Buffer | null, Buffer | null][] = [
      [null, null],
      [null, pk],
      [pk, null],
      [pk, pk],
    ];
    for (const [t, a] of combos) {
      const data = buildAccount({ maker, taker: t, allowedTaker: a, statusByte: 4 });
      expect(readBetStatus(data)).toBe(4);
    }
  });

  it("BET_STATUS_DB and BET_STATUS_NAMES align for every status byte", () => {
    for (let b = 0; b < BET_STATUS_NAMES.length; b++) {
      expect(BET_STATUS_DB[b]).toBeDefined();
    }
    expect(BET_STATUS_DB[4]).toBe("FINALIZED");
    expect(BET_STATUS_NAMES[4]).toBe("Finalized");
  });
});
