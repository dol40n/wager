"use client";

import { useEffect, useState } from "react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { BetCard } from "@/components/bet-card";
import type { BetDisplay } from "@/types";
import { Loader2 } from "lucide-react";

const STATUS_FILTERS = [
  "ALL",
  "OPEN",
  "ACCEPTED",
  "RESULT_PROPOSED",
  "DISPUTED",
  "FINALIZED",
  "CANCELLED",
  "REFUNDED",
] as const;

export default function DashboardPage() {
  const [bets, setBets] = useState<BetDisplay[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<string>("ALL");
  const [walletFilter, setWalletFilter] = useState("");

  useEffect(() => {
    async function fetchBets() {
      setLoading(true);
      const params = new URLSearchParams();
      if (filter !== "ALL") params.set("status", filter);
      if (walletFilter) params.set("maker", walletFilter);

      const res = await fetch(`/api/bets?${params.toString()}`);
      if (res.ok) {
        const data = await res.json();
        setBets(
          data.bets.map((b: Record<string, unknown>) => ({
            id: b.id,
            onChainAddress: b.onChainAddress,
            normalizedQuestion: b.normalizedQuestion,
            category: b.category,
            yesDefinition: b.yesDefinition,
            noDefinition: b.noDefinition,
            deadlineUtc:
              typeof b.deadlineUtc === "string"
                ? b.deadlineUtc
                : new Date(b.deadlineUtc as string).toISOString(),
            makerSide: b.makerSide,
            stakeLamports: b.stakeLamports,
            status: b.status,
            makerPubkey: (b.maker as { pubkey: string }).pubkey,
            takerPubkey: (b.taker as { pubkey: string } | null)?.pubkey || null,
            proposedWinner: b.proposedWinner as string | null,
            finalWinner: b.finalWinner as string | null,
            disputeDeadlineUtc: b.disputeDeadlineUtc as string | null,
            resolverConfidence: b.resolverConfidence as number | null,
            needsManualReview: b.needsManualReview as boolean,
            createdAt:
              typeof b.createdAt === "string"
                ? b.createdAt
                : new Date(b.createdAt as string).toISOString(),
          }))
        );
      }
      setLoading(false);
    }
    fetchBets();
  }, [filter, walletFilter]);

  return (
    <div className="mx-auto max-w-5xl px-4 py-8">
      <h1 className="text-2xl font-bold mb-6">All Wagers</h1>

      <div className="flex flex-wrap gap-2 mb-4">
        {STATUS_FILTERS.map((s) => (
          <Button
            key={s}
            variant={filter === s ? "default" : "outline"}
            size="sm"
            onClick={() => setFilter(s)}
          >
            {s === "ALL" ? "All" : s.replace("_", " ")}
          </Button>
        ))}
      </div>

      <div className="mb-6">
        <Input
          placeholder="Filter by maker wallet address..."
          value={walletFilter}
          onChange={(e) => setWalletFilter(e.target.value)}
        />
      </div>

      {loading ? (
        <div className="flex justify-center py-12">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </div>
      ) : bets.length === 0 ? (
        <p className="text-center text-muted-foreground py-12">
          No wagers found.
        </p>
      ) : (
        <div className="space-y-3">
          {bets.map((bet) => (
            <BetCard key={bet.id} bet={bet} />
          ))}
        </div>
      )}
    </div>
  );
}
