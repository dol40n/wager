"use client";

import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { AlertTriangle, Loader2, Shield } from "lucide-react";
import { lamportsToSol, statusLabel, shortenAddress } from "@/lib/utils";

interface AdminBet {
  id: string;
  normalizedQuestion: string;
  status: string;
  stakeLamports: string;
  proposedWinner: string | null;
  needsManualReview: boolean;
  resolverConfidence: number | null;
  maker: { pubkey: string };
  taker: { pubkey: string } | null;
  evidence: Array<{
    id: string;
    sourceName: string;
    supports: string;
    relevantExcerpt: string;
  }>;
  disputes: Array<{
    id: string;
    reason: string;
    createdAt: string;
  }>;
}

export default function AdminPage() {
  const [apiKey, setApiKey] = useState("");
  const [authenticated, setAuthenticated] = useState(false);
  const [bets, setBets] = useState<AdminBet[]>([]);
  const [loading, setLoading] = useState(false);
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  async function fetchBets() {
    setLoading(true);
    const res = await fetch("/api/bets?status=DISPUTED&limit=100");
    const disputed = res.ok ? await res.json() : { bets: [] };

    const res2 = await fetch("/api/bets?status=RESULT_PROPOSED&limit=100");
    const proposed = res2.ok ? await res2.json() : { bets: [] };

    const res3 = await fetch("/api/bets?status=ACCEPTED&limit=100");
    const accepted = res3.ok ? await res3.json() : { bets: [] };

    const needsReview = accepted.bets.filter(
      (b: AdminBet) => b.needsManualReview
    );

    setBets([...disputed.bets, ...proposed.bets, ...needsReview]);
    setLoading(false);
  }

  useEffect(() => {
    if (authenticated) fetchBets();
  }, [authenticated]);

  async function handleFinalize(betId: string, winnerSide: "YES" | "NO") {
    const bet = bets.find((b) => b.id === betId);
    const stake = bet ? lamportsToSol(Number(bet.stakeLamports)) : 0;
    const pot = stake * 2;
    const fee = pot * 0.01;
    if (
      !window.confirm(
        `Finalize bet ${betId}?\n\nWinner: ${winnerSide}\nPot: ${pot} SOL\nFee (1%): ${fee} SOL\nPayout: ${pot - fee} SOL\n\nThis action is irreversible.`
      )
    )
      return;

    setActionLoading(betId);
    setMessage(null);
    try {
      const res = await fetch(`/api/admin/bets/${betId}/finalize`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-admin-api-key": apiKey,
        },
        body: JSON.stringify({
          winner_side: winnerSide,
          confirmation: "FINALIZE",
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      setMessage(
        `Bet ${betId} finalized: ${winnerSide} wins. Payout: ${data.payout_summary?.winner_payout_sol || "?"} SOL`
      );
      fetchBets();
    } catch (err) {
      setMessage(err instanceof Error ? err.message : "Failed");
    } finally {
      setActionLoading(null);
    }
  }

  async function handleRefund(betId: string) {
    if (
      !window.confirm(
        `Refund bet ${betId}?\n\nBoth maker and taker will receive their stake back.\nThis action is irreversible.`
      )
    )
      return;

    setActionLoading(betId);
    setMessage(null);
    try {
      const res = await fetch(`/api/admin/bets/${betId}/refund`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-admin-api-key": apiKey,
        },
        body: JSON.stringify({ confirmation: "REFUND" }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      setMessage(`Bet ${betId} refunded`);
      fetchBets();
    } catch (err) {
      setMessage(err instanceof Error ? err.message : "Failed");
    } finally {
      setActionLoading(null);
    }
  }

  async function handleRunResolver() {
    setLoading(true);
    setMessage(null);
    try {
      const res = await fetch("/api/resolver/run", {
        method: "POST",
        headers: { "x-admin-api-key": apiKey },
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      setMessage(`Resolver processed ${data.processed} bets`);
      fetchBets();
    } catch (err) {
      setMessage(err instanceof Error ? err.message : "Failed");
    } finally {
      setLoading(false);
    }
  }

  if (!authenticated) {
    return (
      <div className="mx-auto max-w-md px-4 py-12">
        <Card>
          <CardHeader>
            <Shield className="h-8 w-8 mb-2" />
            <CardTitle>Admin Access</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <Input
              type="password"
              placeholder="Admin API key"
              value={apiKey}
              onChange={(e) => setApiKey(e.target.value)}
            />
            <Button
              onClick={() => setAuthenticated(true)}
              disabled={!apiKey}
              className="w-full"
            >
              Access Admin Panel
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-5xl px-4 py-8">
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold">Admin Panel</h1>
        <Button onClick={handleRunResolver} disabled={loading} variant="outline">
          {loading ? (
            <><Loader2 className="h-4 w-4 animate-spin" /> Running...</>
          ) : (
            "Run Resolver"
          )}
        </Button>
      </div>

      <Alert variant="warning" className="mb-6">
        <AlertTriangle className="h-4 w-4" />
        <AlertTitle>Admin Actions</AlertTitle>
        <AlertDescription>
          Finalizing a bet determines the winner. Refunding returns funds to
          both parties. These actions update the database — on-chain
          transactions must be executed separately.
        </AlertDescription>
      </Alert>

      {message && (
        <Alert className="mb-4">
          <AlertDescription>{message}</AlertDescription>
        </Alert>
      )}

      {loading ? (
        <div className="flex justify-center py-12">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </div>
      ) : bets.length === 0 ? (
        <p className="text-center text-muted-foreground py-12">
          No bets need admin review.
        </p>
      ) : (
        <div className="space-y-4">
          {bets.map((bet) => (
            <Card key={bet.id}>
              <CardContent className="pt-6">
                <div className="flex items-start justify-between gap-4 mb-3">
                  <div>
                    <p className="font-medium">{bet.normalizedQuestion}</p>
                    <p className="text-sm text-muted-foreground">
                      ID: {bet.id}
                    </p>
                  </div>
                  <Badge
                    variant={
                      bet.status === "DISPUTED" ? "destructive" : "warning"
                    }
                  >
                    {statusLabel(bet.status)}
                  </Badge>
                </div>

                <div className="grid grid-cols-3 gap-2 text-sm mb-3">
                  <div>
                    Stake: {lamportsToSol(Number(bet.stakeLamports))} SOL
                  </div>
                  <div>
                    Maker: {shortenAddress(bet.maker.pubkey)}
                  </div>
                  <div>
                    Taker:{" "}
                    {bet.taker ? shortenAddress(bet.taker.pubkey) : "None"}
                  </div>
                </div>

                {bet.proposedWinner && (
                  <p className="text-sm mb-2">
                    AI proposed: <strong>{bet.proposedWinner}</strong>
                    {bet.resolverConfidence !== null && (
                      <span className="text-muted-foreground">
                        {" "}({(bet.resolverConfidence * 100).toFixed(0)}%
                        confidence)
                      </span>
                    )}
                  </p>
                )}

                {bet.disputes.length > 0 && (
                  <div className="mb-3">
                    <p className="text-sm font-medium mb-1">Disputes:</p>
                    {bet.disputes.map((d) => (
                      <p key={d.id} className="text-sm text-muted-foreground">
                        - {d.reason}
                      </p>
                    ))}
                  </div>
                )}

                {bet.evidence.length > 0 && (
                  <div className="mb-3">
                    <p className="text-sm font-medium mb-1">Evidence:</p>
                    {bet.evidence.map((e) => (
                      <p key={e.id} className="text-sm text-muted-foreground">
                        [{e.supports}] {e.sourceName}: {e.relevantExcerpt.slice(0, 100)}...
                      </p>
                    ))}
                  </div>
                )}

                <div className="flex gap-2">
                  <Button
                    size="sm"
                    onClick={() => handleFinalize(bet.id, "YES")}
                    disabled={actionLoading === bet.id}
                  >
                    Finalize YES
                  </Button>
                  <Button
                    size="sm"
                    variant="secondary"
                    onClick={() => handleFinalize(bet.id, "NO")}
                    disabled={actionLoading === bet.id}
                  >
                    Finalize NO
                  </Button>
                  <Button
                    size="sm"
                    variant="destructive"
                    onClick={() => handleRefund(bet.id)}
                    disabled={actionLoading === bet.id}
                  >
                    Refund Both
                  </Button>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
