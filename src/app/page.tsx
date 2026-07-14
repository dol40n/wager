import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { AlertTriangle, Database, Search, Shield } from "lucide-react";

export default function Home() {
  return (
    <div className="mx-auto max-w-5xl px-4 py-12">
      <div className="text-center space-y-4 mb-12">
        <h1 className="text-4xl font-bold tracking-tight">
          Wager
        </h1>
        <p className="text-xl text-muted-foreground max-w-2xl mx-auto">
          P2P wager escrow on Solana devnet. Wallet-signed transactions move
          test SOL through a PDA while the backend coordinates evidence and settlement.
        </p>
        <div className="flex gap-3 justify-center">
          <Link href="/create">
            <Button size="lg">Create a Wager</Button>
          </Link>
          <Link href="/dashboard">
            <Button size="lg" variant="outline">
              View Bets
            </Button>
          </Link>
        </div>
      </div>

      <Alert variant="warning" className="mb-8">
        <AlertTriangle className="h-4 w-4" />
        <AlertDescription>
          This is experimental devnet software. All bets use devnet SOL only.
          Do not send real funds. Automated resolution is not guaranteed to be correct.
        </AlertDescription>
      </Alert>

      <div className="grid md:grid-cols-3 gap-6 mb-12">
        <Card>
          <CardHeader>
            <Database className="h-8 w-8 mb-2 text-primary" />
            <CardTitle>Backend Workflow</CardTitle>
          </CardHeader>
          <CardContent className="text-sm text-muted-foreground">
            PostgreSQL state, scheduled jobs and Solana reconciliation coordinate
            each wager from creation through final settlement.
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <Shield className="h-8 w-8 mb-2 text-primary" />
            <CardTitle>Non-Custodial Escrow</CardTitle>
          </CardHeader>
          <CardContent className="text-sm text-muted-foreground">
            Funds are held in a Solana PDA escrow, not a platform wallet.
            Dispute and refund workflows remain experimental and devnet-only.
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <Search className="h-8 w-8 mb-2 text-primary" />
            <CardTitle>Evidence Pipeline</CardTitle>
          </CardHeader>
          <CardContent className="text-sm text-muted-foreground">
            Market APIs, web search and AI-assisted checks produce an evidence-backed
            proposal before the application dispute window.
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>How It Works</CardTitle>
        </CardHeader>
        <CardContent>
          <ol className="list-decimal pl-5 space-y-2 text-sm text-muted-foreground">
            <li>Describe your wager in natural language</li>
            <li>Normalize it into precise YES/NO conditions</li>
            <li>Review and confirm the normalized conditions</li>
            <li>Fund your side of the escrow with devnet SOL</li>
            <li>Share the Blink link with your counterparty</li>
            <li>Taker accepts and funds their side via the Blink</li>
            <li>After the deadline, the resolver gathers evidence and proposes a result</li>
            <li>A 24-hour application-level dispute window opens</li>
            <li>If no dispute, payout is finalized automatically</li>
            <li>If disputed, an admin reviews and finalizes</li>
          </ol>
        </CardContent>
      </Card>
    </div>
  );
}
