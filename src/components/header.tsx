"use client";

import dynamic from "next/dynamic";
import Link from "next/link";
import { AlertTriangle, Bug } from "lucide-react";

const WalletMultiButton = dynamic(
  () =>
    import("@solana/wallet-adapter-react-ui").then(
      (m) => m.WalletMultiButton
    ),
  { ssr: false }
);

const BUG_REPORT_URL = process.env.NEXT_PUBLIC_BUG_REPORT_URL;

export function Header() {
  return (
    <header className="border-b">
      <div className="bg-destructive text-destructive-foreground px-4 py-1 text-center text-xs font-medium">
        DEVNET ONLY &mdash; All SOL on this platform is test SOL with no real value
      </div>
      <div className="mx-auto flex max-w-5xl items-center justify-between px-4 py-3">
        <Link href="/" className="text-xl font-bold">
          Wager <span className="text-xs font-normal text-muted-foreground ml-1">experimental devnet</span>
        </Link>
        <nav className="flex items-center gap-4 text-sm">
          <Link href="/create" className="hover:text-primary">
            Create Bet
          </Link>
          <Link href="/dashboard" className="hover:text-primary">
            Dashboard
          </Link>
          <Link href="/admin" className="hover:text-primary">
            Admin
          </Link>
          {BUG_REPORT_URL && (
            <a
              href={BUG_REPORT_URL}
              target="_blank"
              rel="noopener noreferrer"
              className="hover:text-primary flex items-center gap-1"
            >
              <Bug className="h-3.5 w-3.5" />
              Report Bug
            </a>
          )}
          <WalletMultiButton />
        </nav>
      </div>
      <div className="bg-warning/10 border-b border-warning/30 px-4 py-1.5 text-center text-xs text-warning-foreground flex items-center justify-center gap-1.5">
        <AlertTriangle className="h-3 w-3" />
        Experimental software. Resolution may be incorrect. Max stake: 10 SOL. Application-level 24h dispute window before payout.
      </div>
    </header>
  );
}
