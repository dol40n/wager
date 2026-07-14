import { describe, it, expect, vi } from "vitest";
import { Keypair } from "@solana/web3.js";
import { readOnChainStatus, settleOnChain } from "@/lib/solana/settle";
import * as program from "@/lib/solana/program";

function buildMockAccountData(opts: {
  takerSome?: boolean;
  allowedTakerSome?: boolean;
  statusByte: number;
}): Buffer {
  const discriminator = Buffer.alloc(8, 0xAA);
  const betIdHash = Buffer.alloc(32, 0xBB);
  const maker = Buffer.alloc(32, 0xCC);

  // taker: Option<Pubkey>
  const taker = opts.takerSome
    ? Buffer.concat([Buffer.from([1]), Buffer.alloc(32, 0xDD)])
    : Buffer.from([0]);

  // allowed_taker: Option<Pubkey>
  const allowedTaker = opts.allowedTakerSome
    ? Buffer.concat([Buffer.from([1]), Buffer.alloc(32, 0xEE)])
    : Buffer.from([0]);

  const makerSide = Buffer.from([0]); // Yes
  const stakeLamports = Buffer.alloc(8, 0);
  const deadlineTs = Buffer.alloc(8, 0);
  const disputeDeadlineTs = Buffer.alloc(8, 0);
  const status = Buffer.from([opts.statusByte]);

  // Fields after status (not read by readOnChainStatus, but present in real accounts)
  const proposedWinner = Buffer.from([0]); // None
  const finalWinner = Buffer.from([0]); // None
  const resolverAuth = Buffer.alloc(32, 0xFF);
  const feeBps = Buffer.alloc(2, 0);
  const evidenceHash = Buffer.alloc(32, 0);
  const bump = Buffer.from([255]);
  const vaultBump = Buffer.from([254]);

  return Buffer.concat([
    discriminator, betIdHash, maker, taker, allowedTaker,
    makerSide, stakeLamports, deadlineTs, disputeDeadlineTs, status,
    proposedWinner, finalWinner, resolverAuth, feeBps, evidenceHash, bump, vaultBump,
  ]);
}

describe("readOnChainStatus", () => {
  it("reads Accepted (1) with taker=Some, allowedTaker=None", () => {
    const data = buildMockAccountData({ takerSome: true, allowedTakerSome: false, statusByte: 1 });
    expect(readOnChainStatus(data)).toBe(1);
  });

  it("reads Open (0) with taker=None, allowedTaker=None", () => {
    const data = buildMockAccountData({ takerSome: false, allowedTakerSome: false, statusByte: 0 });
    expect(readOnChainStatus(data)).toBe(0);
  });

  it("reads Disputed (3) with taker=Some, allowedTaker=Some", () => {
    const data = buildMockAccountData({ takerSome: true, allowedTakerSome: true, statusByte: 3 });
    expect(readOnChainStatus(data)).toBe(3);
  });

  it("reads Finalized (4) with taker=Some, allowedTaker=None", () => {
    const data = buildMockAccountData({ takerSome: true, allowedTakerSome: false, statusByte: 4 });
    expect(readOnChainStatus(data)).toBe(4);
  });

  it("reads ResultProposed (2) with taker=None, allowedTaker=Some", () => {
    const data = buildMockAccountData({ takerSome: false, allowedTakerSome: true, statusByte: 2 });
    expect(readOnChainStatus(data)).toBe(2);
  });

  it("reads Cancelled (5) with both None", () => {
    const data = buildMockAccountData({ takerSome: false, allowedTakerSome: false, statusByte: 5 });
    expect(readOnChainStatus(data)).toBe(5);
  });

  it("reads Refunded (6) with both Some", () => {
    const data = buildMockAccountData({ takerSome: true, allowedTakerSome: true, statusByte: 6 });
    expect(readOnChainStatus(data)).toBe(6);
  });

  it("handles all 4 combinations of Option<Pubkey> fields", () => {
    const combos: [boolean, boolean][] = [
      [false, false],
      [false, true],
      [true, false],
      [true, true],
    ];
    for (const [t, a] of combos) {
      const data = buildMockAccountData({ takerSome: t, allowedTakerSome: a, statusByte: 1 });
      expect(readOnChainStatus(data)).toBe(1);
    }
  });

  it("offset correctness: taker=None is 1 byte, taker=Some is 33 bytes", () => {
    const dataNone = buildMockAccountData({ takerSome: false, allowedTakerSome: false, statusByte: 7 });
    const dataSome = buildMockAccountData({ takerSome: true, allowedTakerSome: false, statusByte: 7 });
    // Both should read the same status byte despite different offsets
    expect(readOnChainStatus(dataNone)).toBe(7);
    expect(readOnChainStatus(dataSome)).toBe(7);
    // But the buffers are different lengths
    expect(dataSome.length - dataNone.length).toBe(32);
  });
});

describe("settleOnChain idempotency", () => {
  const feeWallet = Keypair.generate().publicKey;
  const winner = Keypair.generate().publicKey;

  function mockConnection(opts: { statusByte: number; vaultBalance: number }) {
    return {
      getAccountInfo: vi.fn().mockResolvedValue({
        data: buildMockAccountData({ takerSome: true, allowedTakerSome: false, statusByte: opts.statusByte }),
      }),
      getBalance: vi.fn().mockResolvedValue(opts.vaultBalance),
    };
  }

  it("returns retry success for an already-finalized bet without another payout", async () => {
    const conn = mockConnection({ statusByte: 4, vaultBalance: 0 });
    vi.spyOn(program, "getConnection").mockReturnValue(conn as never);
    vi.spyOn(program, "getResolverKeypair").mockReturnValue(Keypair.generate());

    const result = await settleOnChain(
      { betId: "test-finalized", winnerPubkey: winner.toBase58(), evidenceHash: null },
      feeWallet
    );

    expect(result.success).toBe(true);
    expect(result.error).toBe("Already finalized");
    // Must short-circuit before attempting any settlement transaction.
    expect(Object.keys(result.txSignatures)).toHaveLength(0);
  });

  it("returns failure for a non-finalized bet with an empty vault (status=1, vault=0)", async () => {
    const conn = mockConnection({ statusByte: 1, vaultBalance: 0 });
    vi.spyOn(program, "getConnection").mockReturnValue(conn as never);
    vi.spyOn(program, "getResolverKeypair").mockReturnValue(Keypair.generate());

    const result = await settleOnChain(
      { betId: "test-empty", winnerPubkey: winner.toBase58(), evidenceHash: null },
      feeWallet
    );

    expect(result.success).toBe(false);
    expect(result.error).toBe("Vault is empty");
  });
});
