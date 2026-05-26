import { NextResponse } from "next/server";
import { createHash } from "crypto";
import { prisma } from "@/lib/db";
import { createBetSchema } from "@/lib/validators";
import { computeBetIdHash, deriveBetPDA } from "@/lib/solana/program";

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const parsed = createBetSchema.parse(body);

    let wallet = await prisma.userWallet.findUnique({
      where: { pubkey: parsed.maker_pubkey },
    });
    if (!wallet) {
      wallet = await prisma.userWallet.create({
        data: { pubkey: parsed.maker_pubkey },
      });
    }

    const bet = await prisma.bet.create({
      data: {
        originalText: parsed.original_text,
        normalizedQuestion: parsed.normalized_question,
        category: parsed.category,
        yesDefinition: parsed.yes_definition,
        noDefinition: parsed.no_definition,
        deadlineUtc: new Date(parsed.deadline_utc),
        resolutionSources: parsed.resolution_sources,
        resolutionMethod: parsed.resolution_method.toUpperCase() as
          | "API"
          | "WEB_RESEARCH"
          | "AI_EVIDENCE"
          | "MANUAL_REVIEW",
        objectiveCriteria: parsed.objective_criteria,
        ambiguityScore: parsed.ambiguity_score,
        ambiguityNotes: parsed.ambiguity_notes,
        makerSide: parsed.maker_side,
        stakeLamports: BigInt(parsed.stake_lamports),
        feeBps: parsed.fee_bps,
        makerId: wallet.id,
        betIdHash: createHash("sha256")
          .update(Date.now().toString() + parsed.maker_pubkey)
          .digest("hex"),
        allowedTaker: parsed.allowed_taker || null,
      },
    });

    const betIdHash = computeBetIdHash(bet.id);
    const [betPDA] = deriveBetPDA(betIdHash);

    await prisma.bet.update({
      where: { id: bet.id },
      data: {
        betIdHash: betIdHash.toString("hex"),
        onChainAddress: betPDA.toBase58(),
      },
    });

    return NextResponse.json({
      id: bet.id,
      betIdHash: betIdHash.toString("hex"),
      onChainAddress: betPDA.toBase58(),
    });
  } catch (error) {
    if (error instanceof Error && error.name === "ZodError") {
      return NextResponse.json(
        { error: "Invalid request", details: error.message },
        { status: 400 }
      );
    }
    console.error("Create bet error:", error);
    return NextResponse.json(
      { error: "Failed to create bet" },
      { status: 500 }
    );
  }
}
