import { notFound } from "next/navigation";
import { prisma } from "@/lib/db";
import { BetDetail } from "@/components/bet-detail";

export default async function BetPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;

  const bet = await prisma.bet.findUnique({
    where: { id },
    include: {
      maker: true,
      taker: true,
      evidence: { orderBy: { createdAt: "asc" } },
      disputes: { orderBy: { createdAt: "desc" } },
    },
  });

  if (!bet) notFound();

  const serialized = {
    ...bet,
    stakeLamports: bet.stakeLamports.toString(),
    deadlineUtc: bet.deadlineUtc.toISOString(),
    disputeDeadlineUtc: bet.disputeDeadlineUtc?.toISOString() || null,
    createdAt: bet.createdAt.toISOString(),
    updatedAt: bet.updatedAt.toISOString(),
    evidence: bet.evidence.map((e) => ({
      ...e,
      publishedOrObserved: e.publishedOrObserved?.toISOString() || null,
      createdAt: e.createdAt.toISOString(),
    })),
    disputes: bet.disputes.map((d) => ({
      ...d,
      createdAt: d.createdAt.toISOString(),
    })),
  };

  return (
    <div className="mx-auto max-w-3xl px-4 py-8">
      <BetDetail bet={serialized} />
    </div>
  );
}
