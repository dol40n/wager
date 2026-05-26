import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { Connection } from "@solana/web3.js";
import { SOLANA_RPC_URL, PROGRAM_ID } from "@/lib/constants";
import { getResolverPublicKey } from "@/lib/solana/program";

export async function GET() {
  const checks: Record<string, { ok: boolean; latencyMs?: number; error?: string }> = {};

  const dbStart = Date.now();
  try {
    await prisma.$queryRaw`SELECT 1`;
    checks.database = { ok: true, latencyMs: Date.now() - dbStart };
  } catch (e) {
    checks.database = { ok: false, error: e instanceof Error ? e.message : "unknown" };
  }

  const rpcStart = Date.now();
  try {
    const conn = new Connection(SOLANA_RPC_URL);
    const slot = await conn.getSlot();
    checks.solana_rpc = { ok: slot > 0, latencyMs: Date.now() - rpcStart };
  } catch (e) {
    checks.solana_rpc = { ok: false, error: e instanceof Error ? e.message : "unknown" };
  }

  let resolverPubkey: string | null = null;
  try {
    resolverPubkey = getResolverPublicKey().toBase58();
    checks.resolver_key = { ok: true };
  } catch (e) {
    checks.resolver_key = { ok: false, error: e instanceof Error ? e.message : "unknown" };
  }

  const allOk = Object.values(checks).every((c) => c.ok);

  return NextResponse.json(
    {
      status: allOk ? "healthy" : "degraded",
      program_id: PROGRAM_ID.toBase58(),
      resolver_authority: resolverPubkey,
      checks,
      timestamp: new Date().toISOString(),
    },
    { status: allOk ? 200 : 503 }
  );
}
