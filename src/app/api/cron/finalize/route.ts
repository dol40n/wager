import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { settleOnChain } from "@/lib/solana/settle";
import { FEE_WALLET } from "@/lib/constants";
import { validateCronAuth } from "@/lib/validators";

export async function GET(request: Request) {
  if (!validateCronAuth(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    // RESULT_PROPOSED bets where dispute window has passed and no disputes filed
    const readyBets = await prisma.bet.findMany({
      where: {
        status: "RESULT_PROPOSED",
        proposedWinner: { not: null },
        needsManualReview: false,
        disputeDeadlineUtc: { lte: new Date() },
      },
      include: { maker: true, taker: true, disputes: true },
    });

    const eligible = readyBets.filter((b) => b.disputes.length === 0 && b.taker);

    console.log(`[cron/finalize] Found ${readyBets.length} past-deadline, ${eligible.length} eligible for auto-finalize`);

    const results = [];

    for (const bet of eligible) {
      try {
        const winnerPubkey =
          bet.proposedWinner === "YES"
            ? (bet.makerSide === "YES" ? bet.maker.pubkey : bet.taker!.pubkey)
            : (bet.makerSide === "NO" ? bet.maker.pubkey : bet.taker!.pubkey);

        console.log(`[cron/finalize] Settling ${bet.id}: winner=${bet.proposedWinner} (${winnerPubkey})`);

        const result = await settleOnChain(
          { betId: bet.id, winnerPubkey, evidenceHash: bet.evidenceHash },
          FEE_WALLET
        );

        if (result.success) {
          await prisma.bet.update({
            where: { id: bet.id },
            data: { finalWinner: bet.proposedWinner, status: "FINALIZED", needsManualReview: false },
          });

          for (const [type, sig] of Object.entries(result.txSignatures)) {
            await prisma.transaction.create({
              data: { betId: bet.id, txHash: sig, type: type.toUpperCase(), status: "CONFIRMED" },
            });
          }

          await prisma.adminActionLog.create({
            data: {
              betId: bet.id,
              action: "AUTO_FINALIZE",
              adminIdentity: "cron",
              statusBefore: "RESULT_PROPOSED",
              statusAfter: "FINALIZED",
              evidenceHash: bet.evidenceHash,
              details: JSON.stringify({
                winner_side: bet.proposedWinner, winner_pubkey: winnerPubkey,
                vault_before: result.vaultBefore, vault_after: result.vaultAfter,
                winner_received: result.winnerReceived, fee_received: result.feeReceived,
                tx_signatures: result.txSignatures,
              }),
            },
          });

          results.push({ bet_id: bet.id, status: "FINALIZED", winner: bet.proposedWinner, tx_signatures: result.txSignatures });
          console.log(`[cron/finalize] ✓ ${bet.id} settled on-chain`);
        } else {
          results.push({ bet_id: bet.id, status: "FAILED", error: result.error });
          console.error(`[cron/finalize] ✗ ${bet.id}: ${result.error}`);
        }
      } catch (err) {
        console.error(`[cron/finalize] Error settling ${bet.id}:`, err);
        results.push({ bet_id: bet.id, status: "ERROR", error: err instanceof Error ? err.message : "unknown" });
      }
    }

    return NextResponse.json({
      finalized: results.filter((r) => r.status === "FINALIZED").length,
      total_eligible: eligible.length,
      results,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    console.error("[cron/finalize] Error:", error);
    return NextResponse.json({ error: "Finalize cron failed" }, { status: 500 });
  }
}
