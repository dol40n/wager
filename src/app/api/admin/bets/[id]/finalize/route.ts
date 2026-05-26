import { NextResponse } from "next/server";

export async function POST() {
  return NextResponse.json(
    {
      error: "DB-only finalize is disabled. Use POST /api/admin/bets/:id/finalize-onchain to settle on-chain and update the DB atomically.",
    },
    { status: 410 }
  );
}
