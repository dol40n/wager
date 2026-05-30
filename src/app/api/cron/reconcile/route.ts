import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { validateCronAuth } from "@/lib/validators";
import { computeBetIdHash, deriveBetPDA, deriveVaultPDA, getConnection } from "@/lib/solana/program";
import { parseBetAccount, BET_STATUS_DB } from "@/lib/solana/account-layout";

const CONCURRENCY = 4;
// Non-terminal DB statuses: these can silently diverge from chain if a TX
// landed but the follow-up DB write failed, or a Blink accept never hit /sync.
const NON_TERMINAL = ["OPEN", "ACCEPTED", "RESULT_PROPOSED", "DISPUTED"] as const;

type BetRow = Awaited<ReturnType<typeof fetchBets>>[number];

async function fetchBets() {
  return prisma.bet.findMany({
    where: { status: { in: [...NON_TERMINAL] } },
    include: { maker: true, taker: true },
  });
}

async function reconcileOne(bet: BetRow) {
  const connection = getConnection();
  const betIdHash = computeBetIdHash(bet.id);
  const [betPDA] = deriveBetPDA(betIdHash);
  const [vaultPDA] = deriveVaultPDA(betPDA);

  const accountInfo = await connection.getAccountInfo(betPDA);
  if (!accountInfo || accountInfo.data.length <= 100) {
    return { bet_id: bet.id, skipped: "no on-chain account" };
  }

  const parsed = parseBetAccount(accountInfo.data);
  const chainStatus = BET_STATUS_DB[parsed.status];
  const updates: Record<string, unknown> = {};

  if (chainStatus && chainStatus !== bet.status) {
    updates.status = chainStatus;
    // Chain settled but DB lagged — backfill the winner so the UI is correct.
    if (chainStatus === "FINALIZED" && bet.proposedWinner && !bet.finalWinner) {
      updates.finalWinner = bet.proposedWinner;
    }
  }

  if (parsed.taker && !bet.takerId) {
    let takerWallet = await prisma.userWallet.findUnique({ where: { pubkey: parsed.taker } });
    if (!takerWallet) {
      takerWallet = await prisma.userWallet.create({ data: { pubkey: parsed.taker } });
    }
    updates.takerId = takerWallet.id;
  }

  if (!bet.makerFunded) {
    const vaultBalance = await connection.getBalance(vaultPDA);
    if (vaultBalance >= Number(bet.stakeLamports)) {
      updates.makerFunded = true;
    }
  }

  if (Object.keys(updates).length === 0) {
    return { bet_id: bet.id, in_sync: true };
  }

  await prisma.bet.update({ where: { id: bet.id }, data: updates });
  console.log(`[cron/reconcile] ${bet.id}: ${bet.status} → ${chainStatus ?? bet.status}, fields=${Object.keys(updates).join(",")}`);
  return { bet_id: bet.id, db_status_before: bet.status, chain_status: chainStatus, updated: Object.keys(updates) };
}

export async function GET(request: Request) {
  if (!validateCronAuth(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const bets = await fetchBets();
    console.log(`[cron/reconcile] Checking ${bets.length} non-terminal bets (concurrency: ${CONCURRENCY})`);

    const results: Array<Awaited<ReturnType<typeof reconcileOne>>> = [];
    for (let i = 0; i < bets.length; i += CONCURRENCY) {
      const batch = bets.slice(i, i + CONCURRENCY);
      const settled = await Promise.allSettled(batch.map(reconcileOne));
      for (const [j, r] of settled.entries()) {
        if (r.status === "fulfilled") {
          results.push(r.value);
        } else {
          results.push({ bet_id: batch[j].id, skipped: `error: ${r.reason}` });
        }
      }
    }

    return NextResponse.json({
      checked: bets.length,
      reconciled: results.filter((r) => "updated" in r).length,
      results,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    console.error("[cron/reconcile] Error:", error);
    return NextResponse.json({ error: "Reconcile cron failed" }, { status: 500 });
  }
}
