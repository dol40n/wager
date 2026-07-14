import { PublicKey } from "@solana/web3.js";
import { hashEvidence } from "@/lib/utils";
import {
  computeBetIdHash,
  deriveBetPDA,
  deriveVaultPDA,
  getConnection,
  getResolverKeypair,
} from "./program";
import {
  buildProposeResultTx,
  buildDisputeTx,
  buildAdminFinalizeTx,
  signAndSendTx,
} from "./transactions";
import { BET_STATUS_NAMES, readBetStatus } from "./account-layout";

// Re-exported for backward compatibility (tests + existing callers).
export { readBetStatus as readOnChainStatus } from "./account-layout";

export interface SettleInput {
  betId: string;
  winnerPubkey: string;
  evidenceHash: string | null;
}

export interface SettleResult {
  success: boolean;
  txSignatures: Record<string, string>;
  vaultBefore: number;
  vaultAfter: number;
  winnerReceived: number;
  feeReceived: number;
  error?: string;
}

const STATUS_NAMES = BET_STATUS_NAMES;

async function refreshStatus(connection: ReturnType<typeof getConnection>, betPDA: PublicKey): Promise<number> {
  const info = await connection.getAccountInfo(betPDA);
  if (!info) throw new Error("Bet PDA disappeared during settlement");
  return readBetStatus(info.data);
}

export async function settleOnChain(input: SettleInput, feeWalletKey: PublicKey): Promise<SettleResult> {
  const txSignatures: Record<string, string> = {};
  const resolverKeypair = getResolverKeypair();
  const connection = getConnection();

  const betIdHash = computeBetIdHash(input.betId);
  const [betPDA] = deriveBetPDA(betIdHash);
  const [vaultPDA] = deriveVaultPDA(betPDA);

  // Read the on-chain account + status first. FINALIZED is handled as a retry
  // success before the empty-vault guard, but this branch does not independently
  // re-verify the final winner or the vault postcondition.
  const accountInfo = await connection.getAccountInfo(betPDA);
  if (!accountInfo) {
    return { success: false, txSignatures, vaultBefore: 0, vaultAfter: 0, winnerReceived: 0, feeReceived: 0, error: "Bet PDA not found on-chain" };
  }

  let statusByte = readBetStatus(accountInfo.data);
  const vaultBefore = await connection.getBalance(vaultPDA);
  console.log(`[settle] Bet ${input.betId}: on-chain=${STATUS_NAMES[statusByte] || "Unknown"}, vault=${vaultBefore}`);

  // Already finalized — no second payout transaction is submitted.
  if (statusByte === 4) {
    return { success: true, txSignatures, vaultBefore, vaultAfter: vaultBefore, winnerReceived: 0, feeReceived: 0, error: "Already finalized" };
  }

  if (vaultBefore === 0) {
    return { success: false, txSignatures, vaultBefore: 0, vaultAfter: 0, winnerReceived: 0, feeReceived: 0, error: "Vault is empty" };
  }

  const winnerKey = new PublicKey(input.winnerPubkey);
  const winnerBalBefore = await connection.getBalance(winnerKey);
  const feeBalBefore = await connection.getBalance(feeWalletKey);

  // Step 1: Accepted → propose_result → becomes ResultProposed
  if (statusByte === 1) {
    const evidenceHash = input.evidenceHash
      ? Buffer.from(input.evidenceHash, "hex")
      : hashEvidence("[]");

    const proposeTx = await buildProposeResultTx({
      resolverAuthority: resolverKeypair.publicKey, betPDA, proposedWinner: winnerKey, evidenceHash,
    });
    txSignatures.propose_result = await signAndSendTx(proposeTx, [resolverKeypair]);
    statusByte = await refreshStatus(connection, betPDA);
    console.log(`[settle] After propose: status=${STATUS_NAMES[statusByte]}`);
  }

  // Step 2: ResultProposed → dispute_result → becomes Disputed
  if (statusByte === 2) {
    const disputeTx = await buildDisputeTx({ disputer: resolverKeypair.publicKey, betPDA });
    txSignatures.dispute_result = await signAndSendTx(disputeTx, [resolverKeypair]);
    statusByte = await refreshStatus(connection, betPDA);
    console.log(`[settle] After dispute: status=${STATUS_NAMES[statusByte]}`);
  }

  // Step 3: Disputed → admin_finalize_disputed → becomes Finalized
  if (statusByte === 3) {
    const adminTx = await buildAdminFinalizeTx({
      resolverAuthority: resolverKeypair.publicKey, betPDA, vaultPDA, winner: winnerKey,
    });
    txSignatures.admin_finalize = await signAndSendTx(adminTx, [resolverKeypair]);
  }

  // Unexpected status after stepping through (Open/Cancelled/Refunded)
  else if (statusByte !== 3) {
    return { success: false, txSignatures, vaultBefore, vaultAfter: vaultBefore, winnerReceived: 0, feeReceived: 0, error: `Unexpected on-chain status: ${STATUS_NAMES[statusByte] || "Unknown"} (byte=${statusByte})` };
  }

  const vaultAfter = await connection.getBalance(vaultPDA);
  const winnerReceived = (await connection.getBalance(winnerKey)) - winnerBalBefore;
  const feeReceived = (await connection.getBalance(feeWalletKey)) - feeBalBefore;

  if (vaultAfter !== 0) {
    return { success: false, txSignatures, vaultBefore, vaultAfter, winnerReceived, feeReceived, error: "Vault not drained" };
  }

  return { success: true, txSignatures, vaultBefore, vaultAfter: 0, winnerReceived, feeReceived };
}
