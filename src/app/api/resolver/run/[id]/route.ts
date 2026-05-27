import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { resolveWager, canonicalizeEvidence } from "@/lib/ai/resolver";
import { validateAdminAuth } from "@/lib/validators";
import { hashEvidence } from "@/lib/utils";
import { DISPUTE_WINDOW_SECONDS } from "@/lib/constants";

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
      include: { maker: true, taker: true },
    });

    if (!bet) {
      return NextResponse.json({ error: "Bet not found" }, { status: 404 });
    }
    const url = new URL(request.url);
    const dryRun = url.searchParams.get("dry_run") === "true" && process.env.NODE_ENV !== "production";

    if (!dryRun) {
      if (bet.status !== "ACCEPTED") {
        return NextResponse.json(
          { error: "Bet is not in ACCEPTED status" },
          { status: 400 }
        );
      }
      if (new Date(bet.deadlineUtc).getTime() > Date.now()) {
        return NextResponse.json(
          { error: "Deadline has not passed" },
          { status: 400 }
        );
      }
    }

    const resolution = await resolveWager({
      id: bet.id,
      normalizedQuestion: bet.normalizedQuestion,
      yesDefinition: bet.yesDefinition,
      noDefinition: bet.noDefinition,
      deadlineUtc: bet.deadlineUtc.toISOString(),
      resolutionSources: bet.resolutionSources,
      resolutionMethod: bet.resolutionMethod,
      objectiveCriteria: bet.objectiveCriteria,
      category: bet.category,
      snapshotSource: bet.snapshotSource,
      snapshotSymbol: bet.snapshotSymbol,
      snapshotPrice: bet.snapshotPrice,
      snapshotTimeUtc: bet.snapshotTimeUtc?.toISOString(),
    });

    if (dryRun) {
      return NextResponse.json({ dry_run: true, ...resolution });
    }

    for (const ev of resolution.evidence) {
      await prisma.resolutionEvidence.create({
        data: {
          betId: bet.id,
          sourceUrl: ev.source_url,
          sourceName: ev.source_name,
          publishedOrObserved: ev.published_or_observed_at
            ? new Date(ev.published_or_observed_at)
            : null,
          relevantExcerpt: ev.relevant_excerpt,
          supports: ev.supports,
          explanation: ev.explanation,
        },
      });
    }

    const evidenceJson = canonicalizeEvidence(resolution.evidence);
    const evidenceHashHex = hashEvidence(evidenceJson).toString("hex");

    await prisma.bet.update({
      where: { id: bet.id },
      data: {
        proposedWinner:
          resolution.winner_side !== "UNKNOWN"
            ? resolution.winner_side
            : null,
        resolverConfidence: resolution.confidence,
        needsManualReview: resolution.needs_manual_review,
        evidenceHash: evidenceHashHex,
        status: resolution.needs_manual_review
          ? "ACCEPTED"
          : "RESULT_PROPOSED",
        disputeDeadlineUtc: resolution.needs_manual_review
          ? null
          : new Date(Date.now() + DISPUTE_WINDOW_SECONDS * 1000),
      },
    });

    return NextResponse.json(resolution);
  } catch (error) {
    console.error("Resolver run error:", error);
    return NextResponse.json(
      { error: "Failed to resolve bet" },
      { status: 500 }
    );
  }
}
