import { NextResponse } from "next/server";
import { createHash } from "crypto";
import { prisma } from "@/lib/db";
import { createBetSchema } from "@/lib/validators";
import { computeBetIdHash, deriveBetPDA } from "@/lib/solana/program";
import { isRateLimited } from "@/lib/rate-limit";
import { fetchBinancePrice } from "@/lib/price-snapshot";
import { calculateFeeBps, getSolPriceUsd, checkVipStatus } from "@/lib/fees";
import {
  RATE_LIMIT_MAX_CREATES,
  MAX_ACTIVE_BETS_PER_WALLET,
} from "@/lib/constants";

export async function POST(request: Request) {
  try {
    const ip = request.headers.get("x-forwarded-for") || "unknown";
    if (await isRateLimited(`create:${ip}`, RATE_LIMIT_MAX_CREATES)) {
      return NextResponse.json(
        { error: "Rate limit exceeded. Try again in 1 minute." },
        { status: 429 }
      );
    }

    const body = await request.json();
    const parsed = createBetSchema.parse(body);

    if (await isRateLimited(`create:wallet:${parsed.maker_pubkey}`, RATE_LIMIT_MAX_CREATES)) {
      return NextResponse.json(
        { error: "Rate limit exceeded for this wallet. Try again in 1 minute." },
        { status: 429 }
      );
    }

    let wallet = await prisma.userWallet.findUnique({
      where: { pubkey: parsed.maker_pubkey },
    });
    if (!wallet) {
      wallet = await prisma.userWallet.create({
        data: { pubkey: parsed.maker_pubkey },
      });
    }

    const deadlineMs = new Date(parsed.deadline_utc).getTime();
    if (isNaN(deadlineMs) || deadlineMs <= Date.now() + 60_000) {
      return NextResponse.json(
        { error: "Deadline is in the past or too close. Choose a future time at least 1 minute from now." },
        { status: 400 }
      );
    }

    const activeBets = await prisma.bet.count({
      where: {
        makerId: wallet.id,
        status: { in: ["OPEN", "ACCEPTED", "RESULT_PROPOSED"] },
      },
    });
    if (activeBets >= MAX_ACTIVE_BETS_PER_WALLET) {
      return NextResponse.json(
        {
          error: `Maximum ${MAX_ACTIVE_BETS_PER_WALLET} active bets per wallet. Cancel or wait for existing bets to resolve.`,
        },
        { status: 400 }
      );
    }

    // Snapshot price for crypto API-resolved wagers
    let snapshotData: {
      snapshotSource?: string;
      snapshotSymbol?: string;
      snapshotPrice?: number;
      snapshotTimeUtc?: Date;
    } = {};

    if (parsed.category === "crypto") {
      const symbol = detectCryptoSymbol(parsed.normalized_question);
      if (symbol) {
        try {
          const snapshot = await fetchBinancePrice(symbol);
          snapshotData = {
            snapshotSource: snapshot.source,
            snapshotSymbol: snapshot.symbol,
            snapshotPrice: snapshot.snapshot_price,
            snapshotTimeUtc: new Date(snapshot.snapshot_time_utc),
          };
          console.log(
            `[create] Price snapshot: ${symbol} = $${snapshot.snapshot_price} at ${snapshot.snapshot_time_utc}`
          );
        } catch (err) {
          console.warn(`[create] Failed to snapshot price for ${symbol}:`, err);
        }
      }
    }

    // Server-side fee calculation — ignores client fee_bps
    const [solPrice, isVip] = await Promise.all([
      getSolPriceUsd(),
      checkVipStatus(parsed.maker_pubkey),
    ]);
    const feeCalc = calculateFeeBps(parsed.category, parsed.stake_lamports, solPrice, isVip);

    if (feeCalc.stakeTooLow) {
      const minSol = feeCalc.minStakeLamports! / 1_000_000_000;
      return NextResponse.json(
        { error: `Minimum stake for ${parsed.category} bets is ${minSol.toFixed(3)} SOL at current SOL price.` },
        { status: 400 }
      );
    }

    const bet = await prisma.bet.create({
      data: {
        originalText: parsed.original_text,
        normalizedQuestion: parsed.normalized_question,
        category: parsed.category,
        yesDefinition: parsed.yes_definition,
        noDefinition: parsed.no_definition,
        deadlineUtc: new Date(parsed.deadline_utc),
        resolutionSources: parsed.resolution_sources,
        resolutionMethod: parsed.resolution_method.toUpperCase() as
          | "API"
          | "WEB_RESEARCH"
          | "AI_EVIDENCE"
          | "MANUAL_REVIEW",
        objectiveCriteria: parsed.objective_criteria,
        ambiguityScore: parsed.ambiguity_score,
        ambiguityNotes: parsed.ambiguity_notes,
        makerSide: parsed.maker_side,
        stakeLamports: BigInt(parsed.stake_lamports),
        feeBps: feeCalc.feeBps,
        makerId: wallet.id,
        betIdHash: createHash("sha256")
          .update(Date.now().toString() + parsed.maker_pubkey)
          .digest("hex"),
        allowedTaker: parsed.allowed_taker || null,
        ...snapshotData,
      },
    });

    const betIdHash = computeBetIdHash(bet.id);
    const [betPDA] = deriveBetPDA(betIdHash);

    await prisma.bet.update({
      where: { id: bet.id },
      data: {
        betIdHash: betIdHash.toString("hex"),
        onChainAddress: betPDA.toBase58(),
      },
    });

    return NextResponse.json({
      id: bet.id,
      betIdHash: betIdHash.toString("hex"),
      onChainAddress: betPDA.toBase58(),
      fee: { bps: feeCalc.feeBps, percent: feeCalc.feePercent },
      snapshot: snapshotData.snapshotPrice ? {
        price: snapshotData.snapshotPrice,
        symbol: snapshotData.snapshotSymbol,
      } : null,
    });
  } catch (error) {
    if (error instanceof Error && error.name === "ZodError") {
      return NextResponse.json(
        { error: "Invalid request", details: error.message },
        { status: 400 }
      );
    }
    console.error("Create bet error:", error);
    return NextResponse.json(
      { error: "Failed to create bet" },
      { status: 500 }
    );
  }
}

function detectCryptoSymbol(question: string): string | null {
  const q = question.toUpperCase();
  const symbols: Record<string, string> = {
    BTC: "BTCUSDT",
    BITCOIN: "BTCUSDT",
    ETH: "ETHUSDT",
    ETHEREUM: "ETHUSDT",
    SOL: "SOLUSDT",
    SOLANA: "SOLUSDT",
    BTCUSDT: "BTCUSDT",
    ETHUSDT: "ETHUSDT",
    SOLUSDT: "SOLUSDT",
  };
  for (const [keyword, symbol] of Object.entries(symbols)) {
    if (q.includes(keyword)) return symbol;
  }
  return null;
}
