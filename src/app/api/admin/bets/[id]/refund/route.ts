import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { validateAdminAuth } from "@/lib/validators";
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
    const body = await request.json().catch(() => ({}));

    if (!body.confirmation || body.confirmation !== "REFUND") {
      return NextResponse.json(
        { error: "Missing confirmation. Send { confirmation: 'REFUND' } to proceed." },
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

    const refundable = ["OPEN", "ACCEPTED", "DISPUTED", "RESULT_PROPOSED"];
    if (!refundable.includes(bet.status)) {
      return NextResponse.json(
        { error: "Bet cannot be refunded in current status" },
        { status: 400 }
      );
    }

    const stakeSol = lamportsToSol(bet.stakeLamports);

    console.log(
      `[admin] Refunding bet ${id}: status=${bet.status}, ` +
      `stake=${stakeSol} SOL, maker=${bet.maker.pubkey}, ` +
      `taker=${bet.taker?.pubkey || "none"}`
    );

    await prisma.bet.update({
      where: { id },
      data: {
        status: "REFUNDED",
        needsManualReview: false,
      },
    });

    return NextResponse.json({
      bet_id: id,
      status: "REFUNDED",
      refund_summary: {
        stake_per_side_sol: stakeSol,
        maker: bet.maker.pubkey,
        taker: bet.taker?.pubkey || null,
        previous_status: bet.status,
      },
      message:
        "Bet marked as refunded in DB. Execute on-chain refund transaction separately.",
    });
  } catch (error) {
    console.error("Admin refund error:", error);
    return NextResponse.json(
      { error: "Failed to refund bet" },
      { status: 500 }
    );
  }
}
