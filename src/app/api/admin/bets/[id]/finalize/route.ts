import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { validateAdminAuth, adminFinalizeSchema } from "@/lib/validators";
import { lamportsToSol } from "@/lib/utils";

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  if (!validateAdminAuth(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const { id } = await params;
    const body = await request.json();
    const parsed = adminFinalizeSchema.parse(body);

    if (!parsed.confirmation || parsed.confirmation !== "FINALIZE") {
      return NextResponse.json(
        { error: "Missing confirmation. Send { confirmation: 'FINALIZE' } to proceed." },
        { status: 400 }
      );
    }

    const bet = await prisma.bet.findUnique({
      where: { id },
      include: { maker: true, taker: true, evidence: true, disputes: true },
    });

    if (!bet) {
      return NextResponse.json({ error: "Bet not found" }, { status: 404 });
    }
    if (bet.status !== "DISPUTED" && bet.status !== "RESULT_PROPOSED") {
      return NextResponse.json(
        { error: "Bet must be DISPUTED or RESULT_PROPOSED for admin finalize" },
        { status: 400 }
      );
    }

    const stakeSol = lamportsToSol(bet.stakeLamports);
    const pot = stakeSol * 2;
    const fee = pot * (bet.feeBps / 10_000);
    const payout = pot - fee;

    console.log(
      `[admin] Finalizing bet ${id}: winner=${parsed.winner_side}, ` +
      `pot=${pot} SOL, fee=${fee} SOL, payout=${payout} SOL, ` +
      `evidence_hash=${bet.evidenceHash}, db_status=${bet.status}`
    );

    const statusBefore = bet.status;

    await prisma.bet.update({
      where: { id },
      data: {
        finalWinner: parsed.winner_side,
        status: "FINALIZED",
        needsManualReview: false,
      },
    });

    await prisma.adminActionLog.create({
      data: {
        betId: id,
        action: "FINALIZE",
        adminIdentity: request.headers.get("x-admin-api-key")?.slice(0, 8) + "...",
        statusBefore,
        statusAfter: "FINALIZED",
        evidenceHash: bet.evidenceHash,
        details: JSON.stringify({
          winner_side: parsed.winner_side,
          pot_sol: pot,
          fee_sol: fee,
          payout_sol: payout,
        }),
      },
    });

    return NextResponse.json({
      bet_id: id,
      final_winner: parsed.winner_side,
      status: "FINALIZED",
      payout_summary: {
        total_pot_sol: pot,
        fee_sol: fee,
        winner_payout_sol: payout,
        fee_bps: bet.feeBps,
      },
      evidence_hash: bet.evidenceHash,
      evidence_count: bet.evidence.length,
      dispute_count: bet.disputes.length,
    });
  } catch (error) {
    if (error instanceof Error && error.name === "ZodError") {
      return NextResponse.json(
        { error: "Invalid request", details: error.message },
        { status: 400 }
      );
    }
    console.error("Admin finalize error:", error);
    return NextResponse.json(
      { error: "Failed to finalize bet" },
      { status: 500 }
    );
  }
}
