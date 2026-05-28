import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { lamportsToSol } from "@/lib/utils";
import { VIP_MIN_FINALIZED_BETS, VIP_MIN_VOLUME_SOL } from "@/lib/constants";
import { validateCronAuth } from "@/lib/validators";

export async function GET(request: Request) {
  if (!validateCronAuth(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    // Get all wallets that have participated in finalized bets
    const wallets = await prisma.userWallet.findMany({
      where: {
        OR: [
          { makerBets: { some: { status: "FINALIZED" } } },
          { takerBets: { some: { status: "FINALIZED" } } },
        ],
      },
      include: {
        makerBets: { where: { status: "FINALIZED" }, select: { stakeLamports: true } },
        takerBets: { where: { status: "FINALIZED" }, select: { stakeLamports: true } },
      },
    });

    const promoted: string[] = [];
    const updated: string[] = [];

    for (const wallet of wallets) {
      const finalizedBets = wallet.makerBets.length + wallet.takerBets.length;
      const volumeSol =
        wallet.makerBets.reduce((sum, b) => sum + lamportsToSol(Number(b.stakeLamports)), 0) +
        wallet.takerBets.reduce((sum, b) => sum + lamportsToSol(Number(b.stakeLamports)), 0);

      const qualifies =
        finalizedBets >= VIP_MIN_FINALIZED_BETS || volumeSol >= VIP_MIN_VOLUME_SOL;

      const existing = await prisma.vipWallet.findUnique({ where: { pubkey: wallet.pubkey } });

      if (qualifies && !existing) {
        await prisma.vipWallet.create({
          data: {
            pubkey: wallet.pubkey,
            reason: "auto-volume",
            label: `${finalizedBets} bets, ${volumeSol.toFixed(2)} SOL`,
            totalVolumeSol: volumeSol,
            finalized_bets: finalizedBets,
          },
        });
        promoted.push(wallet.pubkey);
        console.log(`[vip-check] Promoted ${wallet.pubkey}: ${finalizedBets} bets, ${volumeSol.toFixed(2)} SOL`);
      } else if (existing && existing.reason === "auto-volume") {
        await prisma.vipWallet.update({
          where: { pubkey: wallet.pubkey },
          data: {
            totalVolumeSol: volumeSol,
            finalized_bets: finalizedBets,
            label: `${finalizedBets} bets, ${volumeSol.toFixed(2)} SOL`,
          },
        });
        updated.push(wallet.pubkey);
      }
    }

    console.log(`[vip-check] Scanned ${wallets.length} wallets, promoted ${promoted.length}, updated ${updated.length}`);

    return NextResponse.json({
      scanned: wallets.length,
      promoted: promoted.length,
      updated: updated.length,
      promoted_wallets: promoted,
      thresholds: {
        min_bets: VIP_MIN_FINALIZED_BETS,
        min_volume_sol: VIP_MIN_VOLUME_SOL,
      },
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    console.error("[vip-check] Error:", error);
    return NextResponse.json({ error: "VIP check failed" }, { status: 500 });
  }
}
