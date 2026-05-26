import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { validateAdminAuth } from "@/lib/validators";

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  if (!validateAdminAuth(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const { id } = await params;

    const bet = await prisma.bet.findUnique({
      where: { id },
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
