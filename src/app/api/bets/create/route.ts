import { NextResponse } from "next/server";
import { createHash } from "crypto";
import { prisma } from "@/lib/db";
import { createBetSchema } from "@/lib/validators";
import { computeBetIdHash, deriveBetPDA } from "@/lib/solana/program";
import { isRateLimited } from "@/lib/rate-limit";
import {
  RATE_LIMIT_MAX_CREATES,
  MAX_ACTIVE_BETS_PER_WALLET,
} from "@/lib/constants";

export async function POST(request: Request) {
  try {
    const ip = request.headers.get("x-forwarded-for") || "unknown";
    if (isRateLimited(`create:${ip}`, RATE_LIMIT_MAX_CREATES)) {
      return NextResponse.json(
        { error: "Rate limit exceeded. Try again in 1 minute." },
        { status: 429 }
      );
    }

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

    const activeBets = await prisma.bet.count({
      where: {
        makerId: wallet.id,
        status: { in: ["OPEN", "ACCEPTED", "RESULT_PROPOSED"] },
      },
    });
    if (activeBets >= MAX_ACTIVE_BETS_PER_WALLET) {
      return NextResponse.json(
        {
          error: `Maximum ${MAX_ACTIVE_BETS_PER_WALLET} active bets per wallet. Cancel or wait for existing bets to resolve.`,
        },
        { status: 400 }
      );
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
