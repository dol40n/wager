"use client";

import { useState, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { lamportsToSol, formatDeadline, statusLabel, shortenAddress } from "@/lib/utils";
import { BetDetailData, TERMINAL_STATUSES } from "./bet-detail-types";

function useCountdown(deadline: string | null): string | null {
  const [timeLeft, setTimeLeft] = useState<string | null>(null);

  useEffect(() => {
    if (!deadline) return;
    function tick() {
      const ms = new Date(deadline!).getTime() - Date.now();
      if (ms <= 0) { setTimeLeft("Expired"); return; }
      const h = Math.floor(ms / 3600000);
      const m = Math.floor((ms % 3600000) / 60000);
      const s = Math.floor((ms % 60000) / 1000);
      setTimeLeft(`${h}h ${m}m ${s}s`);
    }
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, [deadline]);

  return timeLeft;
}

export function BetInfoCard({ bet }: { bet: BetDetailData }) {
  const isLive = !TERMINAL_STATUSES.includes(bet.status);
  const disputeCountdown = useCountdown(bet.disputeDeadlineUtc);
  const deadlineCountdown = useCountdown(bet.deadlineUtc);

  const stakeSol = lamportsToSol(Number(bet.stakeLamports));
  const feePct = bet.feeBps / 100;
  const pot = stakeSol * 2;
  const feeAmount = pot * (bet.feeBps / 10000);

  return (
    <Card>
      <CardHeader>
        <div className="flex items-start justify-between gap-2">
          <CardTitle className="text-lg">{bet.normalizedQuestion}</CardTitle>
          <div className="flex items-center gap-2 flex-shrink-0">
            {isLive && (
              <span className="flex items-center gap-1 text-xs text-muted-foreground">
                <span className="relative flex h-2 w-2">
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-green-400 opacity-75"></span>
                  <span className="relative inline-flex rounded-full h-2 w-2 bg-green-500"></span>
                </span>
                Live
              </span>
            )}
            <Badge
              variant={
                bet.status === "FINALIZED"
                  ? "success"
                  : bet.status === "DISPUTED"
                  ? "destructive"
                  : "outline"
              }
            >
              {statusLabel(bet.status)}
            </Badge>
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        <p className="text-sm text-muted-foreground">
          Original: &quot;{bet.originalText}&quot;
        </p>

        <div className="grid grid-cols-2 gap-4 text-sm">
          <div>
            <span className="font-medium">YES means:</span>
            <p className="text-muted-foreground">{bet.yesDefinition}</p>
          </div>
          <div>
            <span className="font-medium">NO means:</span>
            <p className="text-muted-foreground">{bet.noDefinition}</p>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-4 text-sm">
          <div>
            <span className="font-medium">Stake:</span> {stakeSol} SOL each
            <span className="text-muted-foreground"> (pot: {pot} SOL)</span>
          </div>
          <div>
            <span className="font-medium">Fee:</span> {feePct}%
            <span className="text-muted-foreground"> ({feeAmount.toFixed(4)} SOL)</span>
          </div>
          <div>
            <span className="font-medium">Maker side:</span> {bet.makerSide}
          </div>
          <div>
            <span className="font-medium">Deadline:</span>{" "}
            {formatDeadline(bet.deadlineUtc)}
            {deadlineCountdown && deadlineCountdown !== "Expired" && bet.status === "ACCEPTED" && (
              <span className="text-muted-foreground"> ({deadlineCountdown})</span>
            )}
          </div>
          <div>
            <span className="font-medium">Category:</span>{" "}
            <span className="capitalize">{bet.category}</span>
          </div>
          <div>
            <span className="font-medium">Maker:</span>{" "}
            {shortenAddress(bet.maker.pubkey)}
          </div>
          <div>
            <span className="font-medium">Taker:</span>{" "}
            {bet.taker ? shortenAddress(bet.taker.pubkey) : "None yet"}
          </div>
          {bet.onChainAddress && (
            <div className="col-span-2">
              <span className="font-medium">On-chain PDA:</span>{" "}
              {shortenAddress(bet.onChainAddress, 8)}
            </div>
          )}
        </div>

        {bet.proposedWinner && (
          <div className="text-sm space-y-1">
            <div>
              <span className="font-medium">Proposed Winner:</span>{" "}
              {bet.proposedWinner}
              {bet.resolverConfidence !== null && (
                <span className="text-muted-foreground">
                  {" "}(confidence: {(bet.resolverConfidence * 100).toFixed(0)}%)
                </span>
              )}
            </div>
            {bet.resolverConfidence !== null && bet.resolverConfidence < 0.8 && (
              <p className="text-xs text-warning-foreground">
                Low confidence — flagged for admin review. AI was not certain enough to auto-resolve.
              </p>
            )}
            {bet.needsManualReview && (
              <p className="text-xs text-destructive">
                This bet requires manual admin review before payout.
              </p>
            )}
          </div>
        )}

        {bet.finalWinner && (
          <div className="text-sm">
            <span className="font-medium">Final Winner:</span> {bet.finalWinner}
          </div>
        )}

        {bet.evidenceHash && (
          <div className="text-sm">
            <span className="font-medium">Evidence Hash:</span>{" "}
            <code className="text-xs bg-muted px-1 py-0.5 rounded">
              {bet.evidenceHash}
            </code>
          </div>
        )}

        {bet.disputeDeadlineUtc && (
          <div className="text-sm space-y-1">
            <div className="flex items-center gap-2">
              <span className="font-medium">Dispute Window:</span>
              {disputeCountdown === "Expired" ? (
                <Badge variant="secondary">Closed</Badge>
              ) : (
                <Badge variant="warning">{disputeCountdown}</Badge>
              )}
            </div>
            <p className="text-xs text-muted-foreground">
              {disputeCountdown === "Expired"
                ? `Dispute window closed. Payout will finalize automatically. Winner receives ${(pot - feeAmount).toFixed(4)} SOL (${feePct}% fee).`
                : `Either party can dispute within this window. After that, payout finalizes automatically. Winner receives ${(pot - feeAmount).toFixed(4)} SOL (${feePct}% fee).`}
            </p>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
