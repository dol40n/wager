"use client";

import Link from "next/link";
import { AlertTriangle } from "lucide-react";

export function Header() {
  return (
    <header className="border-b">
      <div className="mx-auto flex max-w-5xl items-center justify-between px-4 py-3">
        <Link href="/" className="text-xl font-bold">
          Wager
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
        </nav>
      </div>
      <div className="bg-warning/10 border-b border-warning/30 px-4 py-1.5 text-center text-xs text-warning-foreground flex items-center justify-center gap-1.5">
        <AlertTriangle className="h-3 w-3" />
        Experimental devnet software. Do not use real funds.
      </div>
    </header>
  );
}
