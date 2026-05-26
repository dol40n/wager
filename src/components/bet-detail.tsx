"use client";

import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { AlertTriangle, Copy, ExternalLink } from "lucide-react";
import { lamportsToSol, formatDeadline, statusLabel, shortenAddress } from "@/lib/utils";
import { APP_URL } from "@/lib/constants";

interface BetDetailData {
  id: string;
  onChainAddress: string | null;
  normalizedQuestion: string;
  originalText: string;
  category: string;
  yesDefinition: string;
  noDefinition: string;
  deadlineUtc: string;
  makerSide: string;
  stakeLamports: string;
  status: string;
  makerFunded: boolean;
  maker: { pubkey: string };
  taker: { pubkey: string } | null;
  proposedWinner: string | null;
  finalWinner: string | null;
  disputeDeadlineUtc: string | null;
  resolverConfidence: number | null;
  needsManualReview: boolean;
  evidenceHash: string | null;
  evidence: Array<{
    id: string;
    sourceUrl: string;
    sourceName: string;
    relevantExcerpt: string;
    supports: string;
    explanation: string;
  }>;
  disputes: Array<{
    id: string;
    reason: string;
    createdAt: string;
  }>;
  resolutionSources: string[];
  objectiveCriteria: string[];
}

export function BetDetail({ bet }: { bet: BetDetailData }) {
  const [disputeReason, setDisputeReason] = useState("");
  const [disputeWallet, setDisputeWallet] = useState("");
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  const blinkUrl = `${APP_URL}/api/actions/bet/${bet.id}`;
  const stakeSol = lamportsToSol(Number(bet.stakeLamports));

  async function handleDispute() {
    setLoading(true);
    setMessage(null);
    try {
      const res = await fetch(`/api/bets/${bet.id}/dispute`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          wallet_pubkey: disputeWallet,
          reason: disputeReason,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      setMessage("Dispute filed successfully. Status: DISPUTED");
    } catch (err) {
      setMessage(err instanceof Error ? err.message : "Failed to file dispute");
    } finally {
      setLoading(false);
    }
  }

  const canDispute =
    bet.status === "RESULT_PROPOSED" &&
    bet.disputeDeadlineUtc &&
    new Date(bet.disputeDeadlineUtc).getTime() > Date.now();

  return (
    <div className="space-y-6">
      <Alert variant="warning">
        <AlertTriangle className="h-4 w-4" />
        <AlertTitle>Devnet Only</AlertTitle>
        <AlertDescription>
          This is experimental devnet software. Do not use real funds.
        </AlertDescription>
      </Alert>

      <Card>
        <CardHeader>
          <div className="flex items-start justify-between gap-2">
            <CardTitle className="text-lg">
              {bet.normalizedQuestion}
            </CardTitle>
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
            </div>
            <div>
              <span className="font-medium">Maker side:</span> {bet.makerSide}
            </div>
            <div>
              <span className="font-medium">Deadline:</span>{" "}
              {formatDeadline(bet.deadlineUtc)}
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
              <span className="font-medium">Final Winner:</span>{" "}
              {bet.finalWinner}
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
              <div>
                <span className="font-medium">Dispute Deadline:</span>{" "}
                {formatDeadline(bet.disputeDeadlineUtc)}
              </div>
              <p className="text-xs text-muted-foreground">
                Either party can dispute the proposed result within 24 hours.
                If no dispute is filed, the payout finalizes automatically.
                Winner receives 99% of the pot; 1% goes to the platform fee wallet.
              </p>
            </div>
          )}
        </CardContent>
      </Card>

      {bet.status === "OPEN" && bet.makerFunded && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Blink Link</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex items-center gap-2">
              <code className="flex-1 text-xs bg-muted p-2 rounded overflow-x-auto">
                {blinkUrl}
              </code>
              <Button
                variant="outline"
                size="icon"
                onClick={() => navigator.clipboard.writeText(blinkUrl)}
              >
                <Copy className="h-4 w-4" />
              </Button>
            </div>
            <p className="text-xs text-muted-foreground mt-2">
              Share this link for the taker to accept the wager via Solana Blink.
            </p>
          </CardContent>
        </Card>
      )}

      {bet.evidence.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Resolution Evidence</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {bet.evidence.map((ev) => (
              <div key={ev.id} className="border rounded-lg p-3 text-sm">
                <div className="flex items-center justify-between mb-1">
                  <span className="font-medium">{ev.sourceName}</span>
                  <Badge
                    variant={
                      ev.supports === "YES"
                        ? "success"
                        : ev.supports === "NO"
                        ? "destructive"
                        : "secondary"
                    }
                  >
                    {ev.supports}
                  </Badge>
                </div>
                <p className="text-muted-foreground italic">
                  &quot;{ev.relevantExcerpt}&quot;
                </p>
                <p className="mt-1">{ev.explanation}</p>
                {ev.sourceUrl && (
                  <a
                    href={ev.sourceUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1 text-xs text-primary mt-1 hover:underline"
                  >
                    Source <ExternalLink className="h-3 w-3" />
                  </a>
                )}
              </div>
            ))}
          </CardContent>
        </Card>
      )}

      {bet.disputes.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Disputes</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {bet.disputes.map((d) => (
              <div key={d.id} className="border rounded-lg p-3 text-sm">
                <p>{d.reason}</p>
                <p className="text-xs text-muted-foreground mt-1">
                  Filed: {new Date(d.createdAt).toLocaleString()}
                </p>
              </div>
            ))}
          </CardContent>
        </Card>
      )}

      {canDispute && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">File a Dispute</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <input
              className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm"
              placeholder="Your wallet pubkey"
              value={disputeWallet}
              onChange={(e) => setDisputeWallet(e.target.value)}
            />
            <Textarea
              placeholder="Explain why you dispute this result..."
              value={disputeReason}
              onChange={(e) => setDisputeReason(e.target.value)}
              rows={3}
            />
            <Button
              onClick={handleDispute}
              disabled={loading || disputeReason.length < 10 || !disputeWallet}
              variant="destructive"
            >
              {loading ? "Filing..." : "File Dispute"}
            </Button>
            {message && (
              <p className="text-sm text-muted-foreground">{message}</p>
            )}
          </CardContent>
        </Card>
      )}
    </div>
  );
}
