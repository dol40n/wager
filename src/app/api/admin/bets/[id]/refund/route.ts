import { NextResponse } from "next/server";

export async function POST() {
  return NextResponse.json(
    {
      error: "DB-only refund is disabled. Use POST /api/admin/bets/:id/refund-onchain instead.",
    },
    { status: 410 }
  );
}
