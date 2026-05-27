"use client";

import { useEffect, useState, useMemo } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { AlertTriangle, Loader2, Shield, RefreshCw } from "lucide-react";
import { lamportsToSol, statusLabel, shortenAddress } from "@/lib/utils";

type Filter = "all" | "review" | "disputed" | "proposed" | "accepted";

interface AdminBet {
  id: string;
  normalizedQuestion: string;
  category: string;
  status: string;
  stakeLamports: string;
  feeBps: number;
  proposedWinner: string | null;
  finalWinner: string | null;
  needsManualReview: boolean;
  resolverConfidence: number | null;
  resolveAttempts: number;
  lastResolveError: string | null;
  deadlineUtc: string;
  disputeDeadlineUtc: string | null;
  maker: { pubkey: string };
  taker: { pubkey: string } | null;
  evidence: Array<{
    id: string;
    sourceName: string;
    sourceUrl: string;
    supports: string;
    relevantExcerpt: string;
    explanation: string;
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
  const [message, setMessage] = useState<{ text: string; type: "success" | "error" | "info" } | null>(null);
  const [filter, setFilter] = useState<Filter>("all");

  async function fetchBets() {
    setLoading(true);
    try {
      const [res1, res2, res3] = await Promise.all([
        fetch("/api/bets?status=DISPUTED&limit=100"),
        fetch("/api/bets?status=RESULT_PROPOSED&limit=100"),
        fetch("/api/bets?status=ACCEPTED&limit=100"),
      ]);
      const disputed = res1.ok ? await res1.json() : { bets: [] };
      const proposed = res2.ok ? await res2.json() : { bets: [] };
      const accepted = res3.ok ? await res3.json() : { bets: [] };

      setBets([
        ...(disputed.bets || []),
        ...(proposed.bets || []),
        ...(accepted.bets || []),
      ]);
    } catch (err) {
      showMsg("Failed to load bets: " + (err instanceof Error ? err.message : "unknown"), "error");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    if (authenticated) fetchBets();
  }, [authenticated]);

  function showMsg(text: string, type: "success" | "error" | "info" = "info") {
    setMessage({ text, type });
    if (type === "success") setTimeout(() => setMessage(null), 8000);
  }

  const filtered = useMemo(() => {
    switch (filter) {
      case "review": return bets.filter((b) => b.needsManualReview);
      case "disputed": return bets.filter((b) => b.status === "DISPUTED");
      case "proposed": return bets.filter((b) => b.status === "RESULT_PROPOSED");
      case "accepted": return bets.filter((b) => b.status === "ACCEPTED");
      default: return bets;
    }
  }, [bets, filter]);

  const counts = useMemo(() => ({
    all: bets.length,
    review: bets.filter((b) => b.needsManualReview).length,
    disputed: bets.filter((b) => b.status === "DISPUTED").length,
    proposed: bets.filter((b) => b.status === "RESULT_PROPOSED").length,
    accepted: bets.filter((b) => b.status === "ACCEPTED").length,
  }), [bets]);

  async function handleFinalize(betId: string, winnerSide: "YES" | "NO") {
    const bet = bets.find((b) => b.id === betId);
    if (!bet) return;
    const stake = lamportsToSol(Number(bet.stakeLamports));
    const pot = stake * 2;
    const feePct = bet.feeBps / 100;
    const fee = pot * (bet.feeBps / 10000);

    if (!window.confirm(
      `Finalize bet on-chain?\n\nWinner: ${winnerSide}\nPot: ${pot} SOL\nFee (${feePct}%): ${fee.toFixed(4)} SOL\nPayout: ${(pot - fee).toFixed(4)} SOL\n\nThis sends real transactions.`
    )) return;

    setActionLoading(betId);
    setMessage(null);
    try {
      const res = await fetch(`/api/admin/bets/${betId}/finalize-onchain`, {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-admin-api-key": apiKey },
        body: JSON.stringify({ winner_side: winnerSide, confirmation: "FINALIZE" }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      showMsg(`Finalized ${betId}: winner got ${data.settlement?.winner_received_sol} SOL, fee ${data.settlement?.fee_received_sol} SOL`, "success");
      fetchBets();
    } catch (err) {
      showMsg(err instanceof Error ? err.message : "Failed", "error");
    } finally {
      setActionLoading(null);
    }
  }

  async function handleRefund(betId: string) {
    if (!window.confirm(`Refund bet ${betId}?\n\nBoth parties get their stake back. Irreversible.`)) return;

    setActionLoading(betId);
    setMessage(null);
    try {
      const res = await fetch(`/api/admin/bets/${betId}/refund-onchain`, {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-admin-api-key": apiKey },
        body: JSON.stringify({ confirmation: "REFUND" }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      showMsg(`Refunded ${betId}. ${data.on_chain_note || ""}`, "success");
      fetchBets();
    } catch (err) {
      showMsg(err instanceof Error ? err.message : "Failed", "error");
    } finally {
      setActionLoading(null);
    }
  }

  async function handleRunCron(type: "resolve" | "finalize") {
    setLoading(true);
    setMessage(null);
    try {
      const res = await fetch(`/api/cron/${type}`, {
        headers: { "x-admin-api-key": apiKey },
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      const summary = type === "resolve"
        ? `Resolved: ${data.resolved}, Failed: ${data.failed}`
        : `Finalized: ${data.finalized}/${data.total_eligible}`;
      showMsg(`${type} cron: ${summary}`, "success");
      fetchBets();
    } catch (err) {
      showMsg(err instanceof Error ? err.message : "Failed", "error");
    } finally {
      setLoading(false);
    }
  }

  async function handleResolveOne(betId: string) {
    setActionLoading(betId);
    setMessage(null);
    try {
      const res = await fetch(`/api/resolver/run/${betId}?dry_run=true`, {
        method: "POST",
        headers: { "x-admin-api-key": apiKey },
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      showMsg(`Dry run: ${data.winner_side} (confidence: ${data.confidence}, review: ${data.needs_manual_review})`, "info");
    } catch (err) {
      showMsg(err instanceof Error ? err.message : "Failed", "error");
    } finally {
      setActionLoading(null);
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
              onKeyDown={(e) => e.key === "Enter" && apiKey && setAuthenticated(true)}
            />
            <Button onClick={() => setAuthenticated(true)} disabled={!apiKey} className="w-full">
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
        <div className="flex gap-2">
          <Button onClick={() => handleRunCron("resolve")} disabled={loading} variant="outline" size="sm">
            Run Resolver
          </Button>
          <Button onClick={() => handleRunCron("finalize")} disabled={loading} variant="outline" size="sm">
            Run Auto-Finalize
          </Button>
          <Button onClick={fetchBets} disabled={loading} variant="ghost" size="sm">
            <RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} />
          </Button>
        </div>
      </div>

      {/* Filter tabs */}
      <div className="flex gap-2 mb-4 flex-wrap">
        {(["all", "review", "disputed", "proposed", "accepted"] as Filter[]).map((f) => (
          <Button
            key={f}
            variant={filter === f ? "default" : "outline"}
            size="sm"
            onClick={() => setFilter(f)}
          >
            {f === "all" ? "All" : f === "review" ? "Needs Review" : f.charAt(0).toUpperCase() + f.slice(1)}
            {counts[f] > 0 && <span className="ml-1 text-xs opacity-70">({counts[f]})</span>}
          </Button>
        ))}
      </div>

      {message && (
        <Alert variant={message.type === "error" ? "destructive" : "default"} className="mb-4">
          <AlertDescription>{message.text}</AlertDescription>
        </Alert>
      )}

      {loading ? (
        <div className="flex justify-center py-12">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </div>
      ) : filtered.length === 0 ? (
        <p className="text-center text-muted-foreground py-12">
          No bets match this filter.
        </p>
      ) : (
        <div className="space-y-4">
          {filtered.map((bet) => {
            const stake = lamportsToSol(Number(bet.stakeLamports));
            const challengerEvidence = (bet.evidence || []).filter((e) => e.sourceName === "adversarial-challenger");
            const regularEvidence = (bet.evidence || []).filter((e) => e.sourceName !== "adversarial-challenger");

            return (
              <Card key={bet.id}>
                <CardContent className="pt-6">
                  <div className="flex items-start justify-between gap-4 mb-3">
                    <div className="flex-1 min-w-0">
                      <p className="font-medium">{bet.normalizedQuestion}</p>
                      <p className="text-xs text-muted-foreground mt-0.5">
                        {bet.id} &middot; {bet.category} &middot; {stake} SOL &middot; Fee: {bet.feeBps / 100}%
                      </p>
                    </div>
                    <div className="flex gap-1.5 flex-shrink-0">
                      {bet.needsManualReview && (
                        <Badge variant="destructive">Review</Badge>
                      )}
                      <Badge variant={
                        bet.status === "DISPUTED" ? "destructive" :
                        bet.status === "RESULT_PROPOSED" ? "warning" : "outline"
                      }>
                        {statusLabel(bet.status)}
                      </Badge>
                    </div>
                  </div>

                  <div className="grid grid-cols-2 md:grid-cols-4 gap-2 text-sm mb-3">
                    <div>Maker: {shortenAddress(bet.maker.pubkey)}</div>
                    <div>Taker: {bet.taker ? shortenAddress(bet.taker.pubkey) : "None"}</div>
                    <div>Deadline: {new Date(bet.deadlineUtc).toLocaleDateString()}</div>
                    {bet.disputeDeadlineUtc && (
                      <div>
                        Dispute ends: {new Date(bet.disputeDeadlineUtc).toLocaleString()}
                      </div>
                    )}
                  </div>

                  {/* AI Resolution info */}
                  {bet.proposedWinner && (
                    <div className="text-sm mb-2 p-2 bg-muted rounded">
                      AI verdict: <strong>{bet.proposedWinner}</strong>
                      {bet.resolverConfidence !== null && (
                        <span className="text-muted-foreground">
                          {" "}({(bet.resolverConfidence * 100).toFixed(0)}% confidence)
                        </span>
                      )}
                      {bet.resolveAttempts > 1 && (
                        <span className="text-muted-foreground"> &middot; {bet.resolveAttempts} attempts</span>
                      )}
                    </div>
                  )}

                  {/* Resolve error */}
                  {bet.lastResolveError && (
                    <div className="text-sm mb-2 p-2 bg-destructive/10 rounded text-destructive">
                      Last error (attempt {bet.resolveAttempts}/3): {bet.lastResolveError}
                    </div>
                  )}

                  {/* Disputes */}
                  {(bet.disputes || []).length > 0 && (
                    <div className="mb-3 p-2 bg-destructive/5 rounded">
                      <p className="text-sm font-medium mb-1">Disputes ({bet.disputes.length}):</p>
                      {bet.disputes.map((d) => (
                        <p key={d.id} className="text-sm text-muted-foreground">
                          &bull; {d.reason} <span className="text-xs">({new Date(d.createdAt).toLocaleString()})</span>
                        </p>
                      ))}
                    </div>
                  )}

                  {/* Evidence */}
                  {regularEvidence.length > 0 && (
                    <details className="mb-3">
                      <summary className="text-sm font-medium cursor-pointer">
                        Evidence ({regularEvidence.length})
                      </summary>
                      <div className="mt-1 space-y-1">
                        {regularEvidence.map((e) => (
                          <p key={e.id} className="text-xs text-muted-foreground">
                            <Badge variant={e.supports === "YES" ? "success" : e.supports === "NO" ? "destructive" : "secondary"} className="text-[10px] mr-1">
                              {e.supports}
                            </Badge>
                            {e.sourceName}: {e.relevantExcerpt.slice(0, 120)}...
                          </p>
                        ))}
                      </div>
                    </details>
                  )}

                  {/* Challenger logs */}
                  {challengerEvidence.length > 0 && (
                    <details className="mb-3">
                      <summary className="text-sm font-medium cursor-pointer">
                        Challenger Log ({challengerEvidence.length})
                      </summary>
                      <div className="mt-1 space-y-1">
                        {challengerEvidence.map((e) => {
                          let parsed: Record<string, unknown> = {};
                          try { parsed = JSON.parse(e.relevantExcerpt); } catch {}
                          return (
                            <div key={e.id} className="text-xs p-2 bg-muted rounded">
                              <Badge variant={e.supports === "YES" ? "success" : "destructive"} className="text-[10px] mr-1">
                                {e.supports === "YES" ? "Confirmed" : "Challenged"}
                              </Badge>
                              {e.explanation}
                              {parsed.confidence_before !== undefined && (
                                <span className="text-muted-foreground ml-2">
                                  Confidence: {String(parsed.confidence_before)} &rarr; {String(parsed.confidence_after)}
                                </span>
                              )}
                              {Array.isArray(parsed.edge_cases) && parsed.edge_cases.length > 0 && (
                                <p className="mt-1 text-muted-foreground">
                                  Edge cases: {parsed.edge_cases.join("; ")}
                                </p>
                              )}
                            </div>
                          );
                        })}
                      </div>
                    </details>
                  )}

                  {/* Actions */}
                  <div className="flex gap-2 flex-wrap">
                    <Button size="sm" onClick={() => handleFinalize(bet.id, "YES")} disabled={actionLoading === bet.id}>
                      {actionLoading === bet.id ? <Loader2 className="h-3 w-3 animate-spin" /> : "Finalize YES"}
                    </Button>
                    <Button size="sm" variant="secondary" onClick={() => handleFinalize(bet.id, "NO")} disabled={actionLoading === bet.id}>
                      Finalize NO
                    </Button>
                    <Button size="sm" variant="destructive" onClick={() => handleRefund(bet.id)} disabled={actionLoading === bet.id}>
                      Refund
                    </Button>
                    {bet.status === "ACCEPTED" && (
                      <Button size="sm" variant="outline" onClick={() => handleResolveOne(bet.id)} disabled={actionLoading === bet.id}>
                        Dry-Run Resolve
                      </Button>
                    )}
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}
