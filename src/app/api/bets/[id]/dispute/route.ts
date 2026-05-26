import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { disputeSchema } from "@/lib/validators";

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const body = await request.json();
    const parsed = disputeSchema.parse(body);

    const bet = await prisma.bet.findUnique({
      where: { id },
      include: { maker: true, taker: true },
    });

    if (!bet) {
      return NextResponse.json({ error: "Bet not found" }, { status: 404 });
    }
    if (bet.status !== "RESULT_PROPOSED") {
      return NextResponse.json(
        { error: "Bet is not in RESULT_PROPOSED status" },
        { status: 400 }
      );
    }

    const isMaker = bet.maker.pubkey === parsed.wallet_pubkey;
    const isTaker = bet.taker?.pubkey === parsed.wallet_pubkey;
    if (!isMaker && !isTaker) {
      return NextResponse.json(
        { error: "Only maker or taker can dispute" },
        { status: 403 }
      );
    }

    if (
      bet.disputeDeadlineUtc &&
      new Date(bet.disputeDeadlineUtc).getTime() < Date.now()
    ) {
      return NextResponse.json(
        { error: "Dispute window has expired" },
        { status: 400 }
      );
    }

    const filedById = isMaker ? bet.makerId : bet.takerId!;

    const dispute = await prisma.dispute.create({
      data: {
        betId: id,
        filedBy: filedById,
        reason: parsed.reason,
      },
    });

    await prisma.bet.update({
      where: { id },
      data: { status: "DISPUTED", needsManualReview: true },
    });

    return NextResponse.json({ dispute_id: dispute.id, status: "DISPUTED" });
  } catch (error) {
    if (error instanceof Error && error.name === "ZodError") {
      return NextResponse.json(
        { error: "Invalid request", details: error.message },
        { status: 400 }
      );
    }
    console.error("Dispute error:", error);
    return NextResponse.json(
      { error: "Failed to file dispute" },
      { status: 500 }
    );
  }
}
