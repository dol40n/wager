import { describe, it, expect } from "vitest";
import { readOnChainStatus } from "@/lib/solana/settle";

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
