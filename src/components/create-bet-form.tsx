"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { AlertTriangle, Loader2 } from "lucide-react";
import type { NormalizeResult } from "@/types";

export function CreateBetForm() {
  const router = useRouter();
  const [step, setStep] = useState<"input" | "review" | "confirm">("input");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [text, setText] = useState("");
  const [deadline, setDeadline] = useState("");
  const [stake, setStake] = useState("0.1");
  const [side, setSide] = useState<"YES" | "NO">("YES");
  const [makerPubkey, setMakerPubkey] = useState("");

  const [normalized, setNormalized] = useState<NormalizeResult | null>(null);

  async function handleNormalize() {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/bets/normalize", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          text,
          deadline_utc: deadline ? new Date(deadline).toISOString() : undefined,
        }),
      });
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || "Failed to normalize");
      }
      const data: NormalizeResult = await res.json();
      setNormalized(data);
      setStep("review");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unknown error");
    } finally {
      setLoading(false);
    }
  }

  async function handleCreate() {
    if (!normalized) return;
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/bets/create", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          original_text: normalized.original_text,
          normalized_question: normalized.normalized_question,
          category: normalized.category,
          yes_definition: normalized.yes_definition,
          no_definition: normalized.no_definition,
          deadline_utc: normalized.deadline_utc,
          resolution_sources: normalized.resolution_sources,
          resolution_method: normalized.resolution_method,
          objective_criteria: normalized.objective_criteria,
          ambiguity_score: normalized.ambiguity_score,
          ambiguity_notes: normalized.ambiguity_notes,
          maker_side: side,
          stake_lamports: Math.round(parseFloat(stake) * 1_000_000_000),
          maker_pubkey: makerPubkey,
        }),
      });
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || "Failed to create bet");
      }
      const data = await res.json();
      router.push(`/bet/${data.id}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unknown error");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="space-y-6">
      {error && (
        <Alert variant="destructive">
          <AlertTitle>Error</AlertTitle>
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}

      {step === "input" && (
        <Card>
          <CardHeader>
            <CardTitle>Describe Your Wager</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="text">Wager condition (natural language)</Label>
              <Textarea
                id="text"
                placeholder="e.g., Bitcoin will be above $100,000 on June 1, 2026"
                value={text}
                onChange={(e) => setText(e.target.value)}
                rows={3}
              />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="deadline">Deadline (optional)</Label>
                <Input
                  id="deadline"
                  type="datetime-local"
                  value={deadline}
                  onChange={(e) => setDeadline(e.target.value)}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="stake">Stake (SOL)</Label>
                <Input
                  id="stake"
                  type="number"
                  min="0.01"
                  max="10"
                  step="0.01"
                  value={stake}
                  onChange={(e) => setStake(e.target.value)}
                />
              </div>
            </div>
            <div className="space-y-2">
              <Label htmlFor="pubkey">Your Wallet Pubkey</Label>
              <Input
                id="pubkey"
                placeholder="Your Solana wallet address"
                value={makerPubkey}
                onChange={(e) => setMakerPubkey(e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label>Your Side</Label>
              <div className="flex gap-2">
                <Button
                  type="button"
                  variant={side === "YES" ? "default" : "outline"}
                  onClick={() => setSide("YES")}
                >
                  YES
                </Button>
                <Button
                  type="button"
                  variant={side === "NO" ? "default" : "outline"}
                  onClick={() => setSide("NO")}
                >
                  NO
                </Button>
              </div>
            </div>
            <Button
              onClick={handleNormalize}
              disabled={loading || text.length < 10 || !makerPubkey}
              className="w-full"
            >
              {loading ? (
                <><Loader2 className="h-4 w-4 animate-spin" /> Analyzing...</>
              ) : (
                "Analyze Wager"
              )}
            </Button>
          </CardContent>
        </Card>
      )}

      {step === "review" && normalized && (
        <Card>
          <CardHeader>
            <CardTitle>Review Normalized Condition</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {normalized.should_reject && (
              <Alert variant="destructive">
                <AlertTriangle className="h-4 w-4" />
                <AlertTitle>Wager Rejected</AlertTitle>
                <AlertDescription>
                  {normalized.rejection_reason}
                </AlertDescription>
              </Alert>
            )}

            {normalized.ambiguity_score > 0.25 && !normalized.should_reject && (
              <Alert variant="warning">
                <AlertTriangle className="h-4 w-4" />
                <AlertTitle>Ambiguity Warning (score: {normalized.ambiguity_score.toFixed(2)})</AlertTitle>
                <AlertDescription>
                  <ul className="list-disc pl-4 mt-1">
                    {normalized.ambiguity_notes.map((note, i) => (
                      <li key={i}>{note}</li>
                    ))}
                  </ul>
                </AlertDescription>
              </Alert>
            )}

            <div className="space-y-3 text-sm">
              <div>
                <span className="font-medium">Normalized Question:</span>
                <p className="mt-1">{normalized.normalized_question}</p>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <span className="font-medium">YES means:</span>
                  <p className="mt-1 text-muted-foreground">
                    {normalized.yes_definition}
                  </p>
                </div>
                <div>
                  <span className="font-medium">NO means:</span>
                  <p className="mt-1 text-muted-foreground">
                    {normalized.no_definition}
                  </p>
                </div>
              </div>
              <div>
                <span className="font-medium">Category:</span>{" "}
                <span className="capitalize">{normalized.category}</span>
              </div>
              <div>
                <span className="font-medium">Deadline:</span>{" "}
                {normalized.deadline_utc}
              </div>
              <div>
                <span className="font-medium">Resolution Sources:</span>
                <ul className="list-disc pl-4 mt-1">
                  {normalized.resolution_sources.map((s, i) => (
                    <li key={i}>{s}</li>
                  ))}
                </ul>
              </div>
              <div>
                <span className="font-medium">Resolution Method:</span>{" "}
                {normalized.resolution_method}
              </div>
            </div>

            <div className="flex gap-2">
              <Button
                variant="outline"
                onClick={() => setStep("input")}
              >
                Back
              </Button>
              {!normalized.should_reject && (
                <Button onClick={handleCreate} disabled={loading} className="flex-1">
                  {loading ? (
                    <><Loader2 className="h-4 w-4 animate-spin" /> Creating...</>
                  ) : (
                    "Confirm & Create Bet"
                  )}
                </Button>
              )}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
