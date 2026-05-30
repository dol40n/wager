import {
  ComputeBudgetProgram,
  PublicKey,
  SystemProgram,
  TransactionInstruction,
  TransactionMessage,
  VersionedTransaction,
} from "@solana/web3.js";
import { createHash } from "crypto";
import { PROGRAM_ID, FEE_WALLET } from "../constants";
import { getConnection } from "./program";

// Priority fee (micro-lamports per CU) for resolver-signed settlement TXs so the
// finalize/resolve crons are not dropped under load. Modest; devnet only.
const RESOLVER_PRIORITY_FEE = 10_000;

function anchorDiscriminator(ixName: string): Buffer {
  const preimage = `global:${ixName}`;
  return createHash("sha256").update(preimage).digest().subarray(0, 8);
}

function encodeNoArgs(ixName: string): Buffer {
  return anchorDiscriminator(ixName);
}

function encodeU8Array32(buf: Buffer): Buffer {
  return buf.subarray(0, 32);
}

function encodePublicKey(pk: PublicKey): Buffer {
  return pk.toBuffer();
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

function encodeBetSide(side: "yes" | "no"): Buffer {
  return Buffer.from([side === "yes" ? 0 : 1]);
}

function encodeOptionPubkey(pk: PublicKey | null): Buffer {
  if (pk === null) {
    return Buffer.from([0]);
  }
  return Buffer.concat([Buffer.from([1]), pk.toBuffer()]);
}

export async function buildInitializeBetTx(params: {
  maker: PublicKey;
  betIdHash: Buffer;
  makerSide: "yes" | "no";
  stakeLamports: number;
  deadlineTs: number;
  feeBps: number;
  resolverAuthority: PublicKey;
  allowedTaker: PublicKey | null;
  betPDA: PublicKey;
  vaultPDA: PublicKey;
}): Promise<VersionedTransaction> {
  const data = Buffer.concat([
    anchorDiscriminator("initialize_bet"),
    encodeU8Array32(params.betIdHash),
    encodeBetSide(params.makerSide),
    encodeU64(BigInt(params.stakeLamports)),
    encodeI64(BigInt(params.deadlineTs)),
    encodeU16(params.feeBps),
    encodeOptionPubkey(params.allowedTaker),
  ]);

  const ix = new TransactionInstruction({
    programId: PROGRAM_ID,
    keys: [
      { pubkey: params.betPDA, isSigner: false, isWritable: true },
      { pubkey: params.vaultPDA, isSigner: false, isWritable: false },
      { pubkey: params.maker, isSigner: true, isWritable: true },
      { pubkey: params.resolverAuthority, isSigner: false, isWritable: false },
      { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
    ],
    data,
  });

  return buildVersionedTx(params.maker, [ix]);
}

export async function buildFundMakerTx(params: {
  maker: PublicKey;
  betPDA: PublicKey;
  vaultPDA: PublicKey;
}): Promise<VersionedTransaction> {
  const ix = new TransactionInstruction({
    programId: PROGRAM_ID,
    keys: [
      { pubkey: params.betPDA, isSigner: false, isWritable: true },
      { pubkey: params.vaultPDA, isSigner: false, isWritable: true },
      { pubkey: params.maker, isSigner: true, isWritable: true },
      { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
    ],
    data: encodeNoArgs("fund_maker"),
  });

  return buildVersionedTx(params.maker, [ix]);
}

export async function buildAcceptBetTx(params: {
  taker: PublicKey;
  betPDA: PublicKey;
  vaultPDA: PublicKey;
}): Promise<VersionedTransaction> {
  const ix = new TransactionInstruction({
    programId: PROGRAM_ID,
    keys: [
      { pubkey: params.betPDA, isSigner: false, isWritable: true },
      { pubkey: params.vaultPDA, isSigner: false, isWritable: true },
      { pubkey: params.taker, isSigner: true, isWritable: true },
      { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
    ],
    data: encodeNoArgs("accept_bet"),
  });

  return buildVersionedTx(params.taker, [ix]);
}

export async function buildProposeResultTx(params: {
  resolverAuthority: PublicKey;
  betPDA: PublicKey;
  proposedWinner: PublicKey;
  evidenceHash: Buffer;
}): Promise<VersionedTransaction> {
  const data = Buffer.concat([
    anchorDiscriminator("propose_result"),
    encodePublicKey(params.proposedWinner),
    encodeU8Array32(params.evidenceHash),
  ]);

  const ix = new TransactionInstruction({
    programId: PROGRAM_ID,
    keys: [
      { pubkey: params.betPDA, isSigner: false, isWritable: true },
      { pubkey: params.resolverAuthority, isSigner: true, isWritable: false },
    ],
    data,
  });

  return buildVersionedTx(params.resolverAuthority, [ix], { priorityMicroLamports: RESOLVER_PRIORITY_FEE });
}

export async function buildDisputeTx(params: {
  disputer: PublicKey;
  betPDA: PublicKey;
}): Promise<VersionedTransaction> {
  const ix = new TransactionInstruction({
    programId: PROGRAM_ID,
    keys: [
      { pubkey: params.betPDA, isSigner: false, isWritable: true },
      { pubkey: params.disputer, isSigner: true, isWritable: false },
    ],
    data: encodeNoArgs("dispute_result"),
  });

  return buildVersionedTx(params.disputer, [ix], { priorityMicroLamports: RESOLVER_PRIORITY_FEE });
}

export async function buildFinalizeAfterDisputeTx(params: {
  betPDA: PublicKey;
  vaultPDA: PublicKey;
  winner: PublicKey;
}): Promise<VersionedTransaction> {
  const ix = new TransactionInstruction({
    programId: PROGRAM_ID,
    keys: [
      { pubkey: params.betPDA, isSigner: false, isWritable: true },
      { pubkey: params.vaultPDA, isSigner: false, isWritable: true },
      { pubkey: params.winner, isSigner: false, isWritable: true },
      { pubkey: FEE_WALLET, isSigner: false, isWritable: true },
      { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
    ],
    data: encodeNoArgs("finalize_result_after_dispute_window"),
  });

  return buildVersionedTx(params.winner, [ix]);
}

export async function buildAdminFinalizeTx(params: {
  resolverAuthority: PublicKey;
  betPDA: PublicKey;
  vaultPDA: PublicKey;
  winner: PublicKey;
}): Promise<VersionedTransaction> {
  const data = Buffer.concat([
    anchorDiscriminator("admin_finalize_disputed"),
    encodePublicKey(params.winner),
  ]);

  const ix = new TransactionInstruction({
    programId: PROGRAM_ID,
    keys: [
      { pubkey: params.betPDA, isSigner: false, isWritable: true },
      { pubkey: params.vaultPDA, isSigner: false, isWritable: true },
      { pubkey: params.winner, isSigner: false, isWritable: true },
      { pubkey: FEE_WALLET, isSigner: false, isWritable: true },
      { pubkey: params.resolverAuthority, isSigner: true, isWritable: false },
      { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
    ],
    data,
  });

  return buildVersionedTx(params.resolverAuthority, [ix], { priorityMicroLamports: RESOLVER_PRIORITY_FEE });
}

export async function buildInitializeAndFundTx(params: {
  maker: PublicKey;
  betIdHash: Buffer;
  makerSide: "yes" | "no";
  stakeLamports: number;
  deadlineTs: number;
  feeBps: number;
  resolverAuthority: PublicKey;
  allowedTaker: PublicKey | null;
  betPDA: PublicKey;
  vaultPDA: PublicKey;
}): Promise<VersionedTransaction> {
  const initData = Buffer.concat([
    anchorDiscriminator("initialize_bet"),
    encodeU8Array32(params.betIdHash),
    encodeBetSide(params.makerSide),
    encodeU64(BigInt(params.stakeLamports)),
    encodeI64(BigInt(params.deadlineTs)),
    encodeU16(params.feeBps),
    encodeOptionPubkey(params.allowedTaker),
  ]);

  const initIx = new TransactionInstruction({
    programId: PROGRAM_ID,
    keys: [
      { pubkey: params.betPDA, isSigner: false, isWritable: true },
      { pubkey: params.vaultPDA, isSigner: false, isWritable: false },
      { pubkey: params.maker, isSigner: true, isWritable: true },
      { pubkey: params.resolverAuthority, isSigner: false, isWritable: false },
      { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
    ],
    data: initData,
  });

  const fundIx = new TransactionInstruction({
    programId: PROGRAM_ID,
    keys: [
      { pubkey: params.betPDA, isSigner: false, isWritable: true },
      { pubkey: params.vaultPDA, isSigner: false, isWritable: true },
      { pubkey: params.maker, isSigner: true, isWritable: true },
      { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
    ],
    data: encodeNoArgs("fund_maker"),
  });

  return buildVersionedTx(params.maker, [initIx, fundIx]);
}

async function buildVersionedTx(
  payer: PublicKey,
  instructions: TransactionInstruction[],
  opts?: { priorityMicroLamports?: number }
): Promise<VersionedTransaction> {
  const connection = getConnection();
  const { blockhash } = await connection.getLatestBlockhash("confirmed");

  // Backend-signed TXs (resolver settlement) attach a priority fee so they are
  // not dropped when the network is busy — this is what the finalize/resolve
  // crons rely on. User/Blink TXs omit it to keep the signed fee predictable.
  const finalIxs =
    opts?.priorityMicroLamports && opts.priorityMicroLamports > 0
      ? [
          ComputeBudgetProgram.setComputeUnitPrice({
            microLamports: opts.priorityMicroLamports,
          }),
          ...instructions,
        ]
      : instructions;

  const message = new TransactionMessage({
    payerKey: payer,
    recentBlockhash: blockhash,
    instructions: finalIxs,
  }).compileToV0Message();

  return new VersionedTransaction(message);
}

function isExpiredBlockhashError(err: unknown): boolean {
  const msg = String(err instanceof Error ? err.message : err).toLowerCase();
  return msg.includes("block height exceeded") || msg.includes("blockhash not found");
}

export async function signAndSendTx(
  tx: VersionedTransaction,
  signers: import("@solana/web3.js").Keypair[],
  opts?: { maxRetries?: number }
): Promise<string> {
  tx.sign(signers);
  const connection = getConnection();
  const raw = tx.serialize();
  const blockhash = tx.message.recentBlockhash;
  // A blockhash is valid for ~150 slots; getBlockHeight + 150 bounds the wait
  // so confirmTransaction returns instead of hanging on the deprecated form.
  const lastValidBlockHeight = (await connection.getBlockHeight("confirmed")) + 150;
  const maxRetries = opts?.maxRetries ?? 3;

  let lastErr: unknown;
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      // Re-sending the same serialized TX is safe: identical signature, so it
      // dedupes on-chain rather than double-spending.
      const sig = await connection.sendRawTransaction(raw, {
        skipPreflight: false,
        preflightCommitment: "confirmed",
        maxRetries: 5,
      });
      const result = await connection.confirmTransaction(
        { signature: sig, blockhash, lastValidBlockHeight },
        "confirmed"
      );
      if (result.value.err) {
        throw new Error(`TX ${sig} failed on-chain: ${JSON.stringify(result.value.err)}`);
      }
      return sig;
    } catch (err) {
      lastErr = err;
      // Once the blockhash is expired the TX can never land — fail fast so the
      // caller (settle/cron) retries with a freshly built TX.
      if (isExpiredBlockhashError(err)) throw err;
      if (attempt < maxRetries) {
        await new Promise((r) => setTimeout(r, 500 * attempt));
      }
    }
  }
  throw lastErr;
}
