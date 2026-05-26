import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;

    const bet = await prisma.bet.findUnique({
      where: { id },
      include: {
        maker: true,
        taker: true,
        evidence: true,
        disputes: true,
        transactions: true,
      },
    });

    if (!bet) {
      return NextResponse.json({ error: "Bet not found" }, { status: 404 });
    }

    return NextResponse.json({
      ...bet,
      stakeLamports: bet.stakeLamports.toString(),
    });
  } catch (error) {
    console.error("Get bet error:", error);
    return NextResponse.json(
      { error: "Failed to fetch bet" },
      { status: 500 }
    );
  }
}
