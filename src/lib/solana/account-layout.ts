import { PublicKey } from "@solana/web3.js";

/**
 * Single source of truth for decoding the on-chain BetAccount layout.
 *
 * Borsh layout (after the 8-byte Anchor discriminator):
 *   bet_id_hash        [u8; 32]
 *   maker              Pubkey            (32)
 *   taker              Option<Pubkey>    (1 + 32 if Some)
 *   allowed_taker      Option<Pubkey>    (1 + 32 if Some)
 *   maker_side         BetSide enum      (1)
 *   stake_lamports     u64               (8)
 *   deadline_ts        i64               (8)
 *   dispute_deadline_ts i64              (8)
 *   status             BetStatus enum    (1)
 *   ... (proposed_winner, final_winner, resolver_authority, fee_bps,
 *        evidence_hash, bump, vault_bump — not decoded here)
 *
 * Keep this in sync with programs/wager_escrow/src/state.rs.
 */

// On-chain status byte → human-readable name (index = byte value).
export const BET_STATUS_NAMES = [
  "Open",
  "Accepted",
  "ResultProposed",
  "Disputed",
  "Finalized",
  "Cancelled",
  "Refunded",
] as const;

// On-chain status byte → DB BetStatus enum value.
export const BET_STATUS_DB: Record<number, string> = {
  0: "OPEN",
  1: "ACCEPTED",
  2: "RESULT_PROPOSED",
  3: "DISPUTED",
  4: "FINALIZED",
  5: "CANCELLED",
  6: "REFUNDED",
};

export interface ParsedBetAccount {
  maker: string;
  taker: string | null;
  allowedTaker: string | null;
  makerSide: number;
  stakeLamports: bigint;
  deadlineTs: bigint;
  disputeDeadlineTs: bigint;
  status: number;
}

function readOptionPubkey(
  data: Buffer,
  offset: number
): { value: string | null; next: number } {
  const flag = data[offset];
  if (flag === 1) {
    return {
      value: new PublicKey(data.subarray(offset + 1, offset + 33)).toBase58(),
      next: offset + 33,
    };
  }
  return { value: null, next: offset + 1 };
}

export function parseBetAccount(data: Buffer): ParsedBetAccount {
  let offset = 8; // discriminator
  offset += 32; // bet_id_hash
  const maker = new PublicKey(data.subarray(offset, offset + 32)).toBase58();
  offset += 32;

  const takerR = readOptionPubkey(data, offset);
  offset = takerR.next;
  const allowedR = readOptionPubkey(data, offset);
  offset = allowedR.next;

  const makerSide = data[offset];
  offset += 1;
  const stakeLamports = data.readBigUInt64LE(offset);
  offset += 8;
  const deadlineTs = data.readBigInt64LE(offset);
  offset += 8;
  const disputeDeadlineTs = data.readBigInt64LE(offset);
  offset += 8;
  const status = data[offset];

  return {
    maker,
    taker: takerR.value,
    allowedTaker: allowedR.value,
    makerSide,
    stakeLamports,
    deadlineTs,
    disputeDeadlineTs,
    status,
  };
}

export function readBetStatus(data: Buffer): number {
  return parseBetAccount(data).status;
}
