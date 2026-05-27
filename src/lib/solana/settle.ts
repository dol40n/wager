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

const STATUS_NAMES = ["Open", "Accepted", "ResultProposed", "Disputed", "Finalized", "Cancelled", "Refunded"];

function readOnChainStatus(data: Buffer): number {
  let offset = 8 + 32 + 32; // discriminator + bet_id_hash + maker
  const takerFlag = data[offset]; offset += takerFlag === 1 ? 33 : 1;
  const allowedFlag = data[offset]; offset += allowedFlag === 1 ? 33 : 1;
  offset += 1; // maker_side
  offset += 8; // stake_lamports
  offset += 8; // deadline_ts
  offset += 8; // dispute_deadline_ts
  return data[offset];
}

export async function settleOnChain(input: SettleInput, feeWalletKey: PublicKey): Promise<SettleResult> {
  const txSignatures: Record<string, string> = {};
  const resolverKeypair = getResolverKeypair();
  const connection = getConnection();

  const betIdHash = computeBetIdHash(input.betId);
  const [betPDA] = deriveBetPDA(betIdHash);
  const [vaultPDA] = deriveVaultPDA(betPDA);

  const vaultBefore = await connection.getBalance(vaultPDA);
  if (vaultBefore === 0) {
    return { success: false, txSignatures, vaultBefore: 0, vaultAfter: 0, winnerReceived: 0, feeReceived: 0, error: "Vault is empty" };
  }

  const winnerKey = new PublicKey(input.winnerPubkey);
  const winnerBalBefore = await connection.getBalance(winnerKey);
  const feeBalBefore = await connection.getBalance(feeWalletKey);

  const accountInfo = await connection.getAccountInfo(betPDA);
  if (!accountInfo) {
    return { success: false, txSignatures, vaultBefore, vaultAfter: vaultBefore, winnerReceived: 0, feeReceived: 0, error: "Bet PDA not found on-chain" };
  }

  const statusByte = readOnChainStatus(accountInfo.data);
  const onChainStatus = STATUS_NAMES[statusByte] || "Unknown";

  console.log(`[settle] Bet ${input.betId}: on-chain=${onChainStatus}, vault=${vaultBefore}`);

  if (statusByte === 1) { // Accepted → propose → dispute → admin_finalize
    const evidenceHash = input.evidenceHash
      ? Buffer.from(input.evidenceHash, "hex")
      : hashEvidence("[]");

    const proposeTx = await buildProposeResultTx({
      resolverAuthority: resolverKeypair.publicKey, betPDA, proposedWinner: winnerKey, evidenceHash,
    });
    txSignatures.propose_result = await signAndSendTx(proposeTx, [resolverKeypair]);

    const disputeTx = await buildDisputeTx({ disputer: resolverKeypair.publicKey, betPDA });
    txSignatures.dispute_result = await signAndSendTx(disputeTx, [resolverKeypair]);

    const adminTx = await buildAdminFinalizeTx({
      resolverAuthority: resolverKeypair.publicKey, betPDA, vaultPDA, winner: winnerKey,
    });
    txSignatures.admin_finalize = await signAndSendTx(adminTx, [resolverKeypair]);
  } else if (statusByte === 2) { // ResultProposed → dispute → admin_finalize
    const disputeTx = await buildDisputeTx({ disputer: resolverKeypair.publicKey, betPDA });
    txSignatures.dispute_result = await signAndSendTx(disputeTx, [resolverKeypair]);

    const adminTx = await buildAdminFinalizeTx({
      resolverAuthority: resolverKeypair.publicKey, betPDA, vaultPDA, winner: winnerKey,
    });
    txSignatures.admin_finalize = await signAndSendTx(adminTx, [resolverKeypair]);
  } else if (statusByte === 3) { // Disputed → admin_finalize
    const adminTx = await buildAdminFinalizeTx({
      resolverAuthority: resolverKeypair.publicKey, betPDA, vaultPDA, winner: winnerKey,
    });
    txSignatures.admin_finalize = await signAndSendTx(adminTx, [resolverKeypair]);
  } else if (statusByte === 4) {
    return { success: true, txSignatures, vaultBefore, vaultAfter: 0, winnerReceived: 0, feeReceived: 0, error: "Already finalized" };
  } else {
    return { success: false, txSignatures, vaultBefore, vaultAfter: vaultBefore, winnerReceived: 0, feeReceived: 0, error: `Unexpected on-chain status: ${onChainStatus}` };
  }

  const vaultAfter = await connection.getBalance(vaultPDA);
  const winnerReceived = (await connection.getBalance(winnerKey)) - winnerBalBefore;
  const feeReceived = (await connection.getBalance(feeWalletKey)) - feeBalBefore;

  if (vaultAfter !== 0) {
    return { success: false, txSignatures, vaultBefore, vaultAfter, winnerReceived, feeReceived, error: "Vault not drained" };
  }

  return { success: true, txSignatures, vaultBefore, vaultAfter: 0, winnerReceived, feeReceived };
}
