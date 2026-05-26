import { NextResponse } from "next/server";
import { PublicKey } from "@solana/web3.js";
import { prisma } from "@/lib/db";
import { validateAdminAuth, adminFinalizeSchema } from "@/lib/validators";
import { lamportsToSol, hashEvidence } from "@/lib/utils";
import {
  computeBetIdHash,
  deriveBetPDA,
  deriveVaultPDA,
  getConnection,
  getResolverKeypair,
} from "@/lib/solana/program";
import {
  buildProposeResultTx,
  buildDisputeTx,
  buildAdminFinalizeTx,
  signAndSendTx,
} from "@/lib/solana/transactions";
import { FEE_WALLET } from "@/lib/constants";

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  if (!validateAdminAuth(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await params;
  const txSignatures: Record<string, string> = {};

  try {
    const body = await request.json();
    const parsed = adminFinalizeSchema.parse(body);

    if (!parsed.confirmation || parsed.confirmation !== "FINALIZE") {
      return NextResponse.json(
        { error: "Missing confirmation. Send { confirmation: 'FINALIZE' }." },
        { status: 400 }
      );
    }

    const bet = await prisma.bet.findUnique({
      where: { id },
      include: { maker: true, taker: true },
    });
    if (!bet) {
      return NextResponse.json({ error: "Bet not found" }, { status: 404 });
    }
    if (!bet.taker) {
      return NextResponse.json({ error: "Bet has no taker" }, { status: 400 });
    }

    const resolverKeypair = getResolverKeypair();
    const connection = getConnection();

    const betIdHash = computeBetIdHash(bet.id);
    const [betPDA] = deriveBetPDA(betIdHash);
    const [vaultPDA] = deriveVaultPDA(betPDA);

    const vaultBalanceBefore = await connection.getBalance(vaultPDA);
    if (vaultBalanceBefore === 0) {
      return NextResponse.json(
        { error: "Vault is empty — bet may already be settled on-chain" },
        { status: 400 }
      );
    }

    const winnerPubkey =
      parsed.winner_side === "YES"
        ? (bet.makerSide === "YES" ? bet.maker.pubkey : bet.taker.pubkey)
        : (bet.makerSide === "NO" ? bet.maker.pubkey : bet.taker.pubkey);
    const winnerKey = new PublicKey(winnerPubkey);
    const feeWalletKey = FEE_WALLET;

    const winnerBalBefore = await connection.getBalance(winnerKey);
    const feeBalBefore = await connection.getBalance(feeWalletKey);

    // Read on-chain account to determine current status
    const accountInfo = await connection.getAccountInfo(betPDA);
    if (!accountInfo) {
      return NextResponse.json({ error: "Bet PDA not found on-chain" }, { status: 404 });
    }
    // Borsh Option<Pubkey> is 1 byte for None, 33 for Some (variable size)
    const data = accountInfo.data;
    let offset = 8 + 32 + 32; // discriminator + bet_id_hash + maker
    const takerFlag = data[offset]; offset += takerFlag === 1 ? 33 : 1; // taker
    const allowedFlag = data[offset]; offset += allowedFlag === 1 ? 33 : 1; // allowed_taker
    offset += 1; // maker_side
    offset += 8; // stake_lamports
    offset += 8; // deadline_ts
    offset += 8; // dispute_deadline_ts
    const statusByte = data[offset];
    const STATUS_NAMES = ["Open", "Accepted", "ResultProposed", "Disputed", "Finalized", "Cancelled", "Refunded"];
    const onChainStatus = STATUS_NAMES[statusByte] || "Unknown";

    console.log(
      `[finalize-onchain] Bet ${id}: on-chain=${onChainStatus}, db=${bet.status}, ` +
      `winner=${parsed.winner_side} (${winnerPubkey}), vault=${vaultBalanceBefore}`
    );

    // If on-chain is ACCEPTED, we need propose_result first
    if (statusByte === 1) { // Accepted
      console.log(`[finalize-onchain] Proposing result on-chain...`);
      const evidenceHash = bet.evidenceHash
        ? Buffer.from(bet.evidenceHash, "hex")
        : hashEvidence("[]");

      const proposeTx = await buildProposeResultTx({
        resolverAuthority: resolverKeypair.publicKey,
        betPDA,
        proposedWinner: winnerKey,
        evidenceHash,
      });
      const proposeSig = await signAndSendTx(proposeTx, [resolverKeypair]);
      txSignatures.propose_result = proposeSig;
      console.log(`[finalize-onchain] propose_result TX: ${proposeSig}`);

      // Now dispute it so we can admin_finalize
      console.log(`[finalize-onchain] Disputing on-chain (to enable admin_finalize)...`);
      const disputeTx = await buildDisputeTx({
        disputer: new PublicKey(bet.maker.pubkey),
        betPDA,
      });
      // Dispute must be signed by maker or taker — resolver can't dispute.
      // Instead, we'll skip dispute and wait... but admin_finalize requires DISPUTED.
      // Alternative: use the resolver to directly admin-finalize after propose.
      // Actually, admin_finalize_disputed requires status==DISPUTED.
      // The on-chain program has finalize_result_after_dispute_window for ResultProposed,
      // but that requires 24h wait.
      // For admin flow: propose → dispute (by resolver as maker/taker proxy won't work)
      // We need a different approach: use the on-chain "dispute" signed by either maker or taker.
      // Since we don't have their keys, we'll need to rely on
      // finalize_result_after_dispute_window once 24h passes.
      //
      // WORKAROUND for devnet testing: The resolver authority can be used if we
      // designed it differently, but our program requires maker or taker to dispute.
      //
      // Real solution for this specific bet: Since we just proposed with the maker as winner,
      // and the taker would want to dispute, but we don't have taker's key locally.
      // The hosted backend doesn't have maker/taker keys — only the resolver key.
      //
      // For this specific fix: since the bet was already DB-finalized as YES (maker wins),
      // and we just proposed maker as winner on-chain, we can wait for the 24h dispute window.
      // But for immediate testing, let's try finalize_result_after_dispute_window
      // (it will fail with DisputeWindowActive since the window just started).
      //
      // CORRECT approach: Since this is an admin-resolved bet, the admin decision should
      // bypass the dispute window. Our admin_finalize_disputed instruction handles this
      // but requires DISPUTED status. We need to add propose→admin_finalize flow.
      //
      // For NOW: the propose_result succeeded, making the on-chain status ResultProposed.
      // We can't call admin_finalize_disputed yet. Mark DB as RESULT_PROPOSED and note
      // that it needs dispute window to expire OR a dispute from maker/taker.

      await prisma.bet.update({
        where: { id },
        data: { status: "RESULT_PROPOSED", proposedWinner: parsed.winner_side },
      });

      await prisma.transaction.create({
        data: { betId: id, txHash: proposeSig, type: "PROPOSE_RESULT", status: "CONFIRMED" },
      });

      return NextResponse.json({
        bet_id: id,
        status: "RESULT_PROPOSED",
        on_chain_status: "ResultProposed",
        tx_signatures: txSignatures,
        message: "Result proposed on-chain. Bet enters 24h dispute window. Either party can dispute, or it auto-finalizes after 24h. Use finalize-onchain again after dispute or window expiry.",
        explorer: `https://explorer.solana.com/tx/${proposeSig}?cluster=devnet`,
      });
    }

    // If on-chain is DISPUTED, do admin_finalize_disputed
    if (statusByte === 3) { // Disputed
      const adminTx = await buildAdminFinalizeTx({
        resolverAuthority: resolverKeypair.publicKey,
        betPDA, vaultPDA, winner: winnerKey,
      });
      const adminSig = await signAndSendTx(adminTx, [resolverKeypair]);
      txSignatures.admin_finalize = adminSig;
    }
    // If ResultProposed (statusByte === 2), we can't auto-finalize (need 24h window).
    // Return informational response.
    else if (statusByte === 2) {
      return NextResponse.json({
        bet_id: id,
        status: "RESULT_PROPOSED",
        message: "On-chain status is ResultProposed. Wait for 24h dispute window to expire, or have maker/taker dispute first.",
        vault_balance_sol: lamportsToSol(vaultBalanceBefore),
      });
    } else if (statusByte === 4) { // Already finalized
      return NextResponse.json({
        bet_id: id,
        status: "FINALIZED",
        message: "Already finalized on-chain.",
        vault_balance_sol: lamportsToSol(await connection.getBalance(vaultPDA)),
      });
    } else {
      return NextResponse.json(
        { error: `Unexpected on-chain status: ${onChainStatus} (byte=${statusByte})` },
        { status: 400 }
      );
    }

    // Verify settlement
    const vaultBalanceAfter = await connection.getBalance(vaultPDA);
    const winnerBalAfter = await connection.getBalance(winnerKey);
    const feeBalAfter = await connection.getBalance(feeWalletKey);

    if (vaultBalanceAfter !== 0) {
      console.error(`[finalize-onchain] Vault not drained: ${vaultBalanceAfter}`);
      return NextResponse.json(
        { error: "On-chain tx succeeded but vault not drained", tx_signatures: txSignatures },
        { status: 500 }
      );
    }

    const winnerReceived = winnerBalAfter - winnerBalBefore;
    const feeReceived = feeBalAfter - feeBalBefore;
    const statusBefore = bet.status;

    await prisma.bet.update({
      where: { id },
      data: { finalWinner: parsed.winner_side, status: "FINALIZED", needsManualReview: false },
    });

    for (const [type, sig] of Object.entries(txSignatures)) {
      await prisma.transaction.create({
        data: { betId: id, txHash: sig, type: type.toUpperCase(), status: "CONFIRMED" },
      });
    }

    await prisma.adminActionLog.create({
      data: {
        betId: id,
        action: "FINALIZE_ONCHAIN",
        adminIdentity: request.headers.get("x-admin-api-key")?.slice(0, 8) + "...",
        statusBefore, statusAfter: "FINALIZED",
        evidenceHash: bet.evidenceHash,
        details: JSON.stringify({
          winner_side: parsed.winner_side, winner_pubkey: winnerPubkey,
          vault_before: vaultBalanceBefore, vault_after: vaultBalanceAfter,
          winner_received: winnerReceived, fee_received: feeReceived,
          tx_signatures: txSignatures,
        }),
      },
    });

    return NextResponse.json({
      bet_id: id, status: "FINALIZED",
      tx_signatures: txSignatures,
      explorer: Object.fromEntries(
        Object.entries(txSignatures).map(([k, v]) => [k, `https://explorer.solana.com/tx/${v}?cluster=devnet`])
      ),
      settlement: {
        vault_before: lamportsToSol(vaultBalanceBefore), vault_after: 0,
        winner_received_sol: lamportsToSol(winnerReceived),
        fee_received_sol: lamportsToSol(feeReceived),
        winner_pubkey: winnerPubkey, fee_wallet: feeWalletKey.toBase58(),
      },
    });
  } catch (error) {
    console.error(`[finalize-onchain] Error for bet ${id}:`, error);
    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : "On-chain finalize failed",
        tx_signatures: txSignatures,
      },
      { status: 500 }
    );
  }
}
