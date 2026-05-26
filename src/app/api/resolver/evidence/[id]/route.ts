import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;

    const evidence = await prisma.resolutionEvidence.findMany({
      where: { betId: id },
      orderBy: { createdAt: "asc" },
    });

    if (evidence.length === 0) {
      return NextResponse.json(
        { error: "No evidence found for this bet" },
        { status: 404 }
      );
    }

    const bet = await prisma.bet.findUnique({
      where: { id },
      select: { evidenceHash: true, resolverConfidence: true },
    });

    return NextResponse.json({
      bet_id: id,
      evidence_hash: bet?.evidenceHash,
      confidence: bet?.resolverConfidence,
      evidence,
    });
  } catch (error) {
    console.error("Get evidence error:", error);
    return NextResponse.json(
      { error: "Failed to fetch evidence" },
      { status: 500 }
    );
  }
}
