import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { ExternalLink } from "lucide-react";
import { BetDetailData } from "./bet-detail-types";

export function BetEvidence({ bet }: { bet: BetDetailData }) {
  const regularEvidence = bet.evidence.filter((e) => e.sourceName !== "adversarial-challenger");
  const challengerEvidence = bet.evidence.filter((e) => e.sourceName === "adversarial-challenger");

  return (
    <>
      {regularEvidence.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Resolution Evidence</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {regularEvidence.map((ev) => (
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
                {ev.sourceUrl && !ev.sourceUrl.startsWith("model:") && (
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

      {challengerEvidence.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Adversarial Verification</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {challengerEvidence.map((ev) => {
              let parsed: Record<string, unknown> = {};
              try { parsed = JSON.parse(ev.relevantExcerpt); } catch {}
              const confirmed = ev.supports === "YES";
              return (
                <div key={ev.id} className={`border rounded-lg p-3 text-sm ${confirmed ? "border-green-800/30" : "border-red-800/30"}`}>
                  <div className="flex items-center gap-2 mb-1">
                    <Badge variant={confirmed ? "success" : "destructive"}>
                      {confirmed ? "Verdict Confirmed" : "Verdict Challenged"}
                    </Badge>
                    {parsed.confidence_before !== undefined && (
                      <span className="text-xs text-muted-foreground">
                        Confidence: {String(parsed.confidence_before)} &rarr; {String(parsed.confidence_after)}
                      </span>
                    )}
                  </div>
                  <p className="text-muted-foreground">{ev.explanation}</p>
                  {Array.isArray(parsed.edge_cases) && parsed.edge_cases.length > 0 && (
                    <p className="text-xs text-muted-foreground mt-1">
                      Edge cases found: {parsed.edge_cases.join("; ")}
                    </p>
                  )}
                </div>
              );
            })}
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
    </>
  );
}
