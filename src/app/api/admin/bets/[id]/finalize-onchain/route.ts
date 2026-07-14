import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { validateAdminAuth, adminFinalizeSchema } from "@/lib/validators";
import { lamportsToSol } from "@/lib/utils";
import { settleOnChain } from "@/lib/solana/settle";
import { FEE_WALLET } from "@/lib/constants";

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  if (!validateAdminAuth(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await params;

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

    // Cross-check: warn if admin's winner differs from the AI's proposed verdict.
    // Requires explicit override_ai_verdict flag to proceed against the AI.
    if (
      bet.proposedWinner &&
      bet.proposedWinner !== parsed.winner_side &&
      !parsed.override_ai_verdict
    ) {
      return NextResponse.json(
        {
          error: `Winner side (${parsed.winner_side}) contradicts AI proposed winner (${bet.proposedWinner}). To finalize against the AI verdict, resend with override_ai_verdict: true.`,
          ai_proposed: bet.proposedWinner,
          requested: parsed.winner_side,
        },
        { status: 409 }
      );
    }

    const winnerPubkey =
      parsed.winner_side === "YES"
        ? (bet.makerSide === "YES" ? bet.maker.pubkey : bet.taker.pubkey)
        : (bet.makerSide === "NO" ? bet.maker.pubkey : bet.taker.pubkey);

    const result = await settleOnChain(
      { betId: bet.id, winnerPubkey, evidenceHash: bet.evidenceHash },
      FEE_WALLET
    );

    if (!result.success) {
      return NextResponse.json(
        { error: result.error, tx_signatures: result.txSignatures },
        { status: result.error === "Vault is empty" ? 400 : 500 }
      );
    }

    const statusBefore = bet.status;

    await prisma.bet.update({
      where: { id },
      data: { finalWinner: parsed.winner_side, status: "FINALIZED", needsManualReview: false },
    });

    for (const [type, sig] of Object.entries(result.txSignatures)) {
      await prisma.transaction.create({
        data: { betId: id, txHash: sig, type: type.toUpperCase(), status: "CONFIRMED" },
      });
    }

    await prisma.adminActionLog.create({
      data: {
        betId: id,
        action: "FINALIZE_ONCHAIN",
        // Never persist any part of the shared credential in the audit log.
        adminIdentity: "shared-admin-key",
        statusBefore, statusAfter: "FINALIZED",
        evidenceHash: bet.evidenceHash,
        details: JSON.stringify({
          winner_side: parsed.winner_side, winner_pubkey: winnerPubkey,
          vault_before: result.vaultBefore, vault_after: result.vaultAfter,
          winner_received: result.winnerReceived, fee_received: result.feeReceived,
          tx_signatures: result.txSignatures,
        }),
      },
    });

    return NextResponse.json({
      bet_id: id, status: "FINALIZED",
      tx_signatures: result.txSignatures,
      explorer: Object.fromEntries(
        Object.entries(result.txSignatures).map(([k, v]) => [k, `https://explorer.solana.com/tx/${v}?cluster=devnet`])
      ),
      settlement: {
        vault_before: lamportsToSol(result.vaultBefore), vault_after: 0,
        winner_received_sol: lamportsToSol(result.winnerReceived),
        fee_received_sol: lamportsToSol(result.feeReceived),
        winner_pubkey: winnerPubkey, fee_wallet: FEE_WALLET.toBase58(),
      },
    });
  } catch (error) {
    console.error(`[finalize-onchain] Error for bet ${id}:`, error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "On-chain finalize failed" },
      { status: 500 }
    );
  }
}
