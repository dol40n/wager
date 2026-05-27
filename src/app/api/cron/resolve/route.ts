import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { resolveWager, canonicalizeEvidence } from "@/lib/ai/resolver";
import { hashEvidence } from "@/lib/utils";
import { DISPUTE_WINDOW_SECONDS } from "@/lib/constants";

export async function GET(request: Request) {
  const authHeader = request.headers.get("authorization");
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    const adminKey = request.headers.get("x-admin-api-key");
    if (adminKey !== process.env.ADMIN_API_KEY) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
  }

  try {
    const bets = await prisma.bet.findMany({
      where: {
        status: "ACCEPTED",
        deadlineUtc: { lte: new Date() },
      },
      include: { maker: true, taker: true },
    });

    console.log(`[cron] Found ${bets.length} bets to resolve`);
    const results = [];

    for (const bet of bets) {
      try {
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
            proposedWinner: resolution.winner_side !== "UNKNOWN" ? resolution.winner_side : null,
            resolverConfidence: resolution.confidence,
            needsManualReview: resolution.needs_manual_review,
            evidenceHash: evidenceHashHex,
            status: resolution.needs_manual_review ? "ACCEPTED" : "RESULT_PROPOSED",
            disputeDeadlineUtc: resolution.needs_manual_review
              ? null
              : new Date(Date.now() + DISPUTE_WINDOW_SECONDS * 1000),
          },
        });

        results.push({
          bet_id: bet.id,
          winner: resolution.winner_side,
          confidence: resolution.confidence,
          review: resolution.needs_manual_review,
          evidence_count: resolution.evidence.length,
        });

        console.log(
          `[cron] Resolved ${bet.id}: ${resolution.winner_side} (${resolution.confidence}, review=${resolution.needs_manual_review})`
        );
      } catch (err) {
        console.error(`[cron] Error resolving ${bet.id}:`, err);
        results.push({ bet_id: bet.id, error: err instanceof Error ? err.message : "unknown" });
      }
    }

    return NextResponse.json({
      resolved: results.length,
      results,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    console.error("[cron] Resolver cron error:", error);
    return NextResponse.json({ error: "Cron failed" }, { status: 500 });
  }
}
