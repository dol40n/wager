"use client";

import Link from "next/link";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { lamportsToSol, formatDeadline, statusLabel } from "@/lib/utils";
import type { BetDisplay } from "@/types";

const statusVariant: Record<string, "default" | "secondary" | "destructive" | "outline" | "warning" | "success"> = {
  OPEN: "outline",
  ACCEPTED: "secondary",
  RESULT_PROPOSED: "warning",
  DISPUTED: "destructive",
  FINALIZED: "success",
  CANCELLED: "secondary",
  REFUNDED: "secondary",
};

export function BetCard({ bet }: { bet: BetDisplay }) {
  return (
    <Link href={`/bet/${bet.id}`}>
      <Card className="hover:border-primary/50 transition-colors cursor-pointer">
        <CardHeader className="pb-2">
          <div className="flex items-start justify-between gap-2">
            <CardTitle className="text-base leading-snug">
              {bet.normalizedQuestion}
            </CardTitle>
            <Badge variant={statusVariant[bet.status] || "outline"}>
              {statusLabel(bet.status)}
            </Badge>
          </div>
        </CardHeader>
        <CardContent>
          <div className="flex flex-wrap gap-x-4 gap-y-1 text-sm text-muted-foreground">
            <span>{lamportsToSol(Number(bet.stakeLamports))} SOL each</span>
            <span>Maker: {bet.makerSide}</span>
            <span>Deadline: {formatDeadline(bet.deadlineUtc)}</span>
            <span className="capitalize">{bet.category}</span>
          </div>
        </CardContent>
      </Card>
    </Link>
  );
}
