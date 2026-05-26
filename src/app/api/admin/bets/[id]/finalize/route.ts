import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { validateAdminAuth, adminFinalizeSchema } from "@/lib/validators";

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

    const bet = await prisma.bet.findUnique({
      where: { id },
      include: { maker: true, taker: true },
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

    await prisma.bet.update({
      where: { id },
      data: {
        finalWinner: parsed.winner_side,
        status: "FINALIZED",
        needsManualReview: false,
      },
    });

    return NextResponse.json({
      bet_id: id,
      final_winner: parsed.winner_side,
      status: "FINALIZED",
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
