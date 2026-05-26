import { NextResponse } from "next/server";
import { PublicKey } from "@solana/web3.js";
import { prisma } from "@/lib/db";
import {
  computeBetIdHash,
  deriveBetPDA,
  deriveVaultPDA,
} from "@/lib/solana/program";
import { buildAcceptBetTx } from "@/lib/solana/transactions";

const ACTIONS_CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Access-Control-Allow-Headers":
    "Content-Type, Authorization, Accept-Encoding",
  "X-Action-Version": "2.0",
  "X-Blockchain-Ids": "solana:EtWTRABZaYq6iMfeYKouRu166VU2xqa1",
};

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const { account } = await request.json();

    if (!account) {
      return NextResponse.json(
        { error: "Missing account" },
        { status: 400, headers: ACTIONS_CORS_HEADERS }
      );
    }

    const takerPubkey = new PublicKey(account);

    const bet = await prisma.bet.findUnique({
      where: { id },
      include: { maker: true },
    });

    if (!bet) {
      return NextResponse.json(
        { error: "Bet not found" },
        { status: 404, headers: ACTIONS_CORS_HEADERS }
      );
    }
    if (bet.status !== "OPEN") {
      return NextResponse.json(
        { error: "Bet is not available" },
        { status: 400, headers: ACTIONS_CORS_HEADERS }
      );
    }
    if (!bet.makerFunded) {
      return NextResponse.json(
        { error: "Maker has not funded this bet yet" },
        { status: 400, headers: ACTIONS_CORS_HEADERS }
      );
    }
    if (new Date(bet.deadlineUtc).getTime() <= Date.now()) {
      return NextResponse.json(
        { error: "Bet deadline has passed" },
        { status: 400, headers: ACTIONS_CORS_HEADERS }
      );
    }
    if (
      bet.allowedTaker &&
      bet.allowedTaker !== takerPubkey.toBase58()
    ) {
      return NextResponse.json(
        { error: "You are not the allowed taker for this bet" },
        { status: 403, headers: ACTIONS_CORS_HEADERS }
      );
    }
    if (bet.maker.pubkey === takerPubkey.toBase58()) {
      return NextResponse.json(
        { error: "Maker cannot accept their own bet" },
        { status: 400, headers: ACTIONS_CORS_HEADERS }
      );
    }

    const betIdHash = computeBetIdHash(bet.id);
    const [betPDA] = deriveBetPDA(betIdHash);
    const [vaultPDA] = deriveVaultPDA(betPDA);

    const tx = await buildAcceptBetTx({
      taker: takerPubkey,
      betPDA,
      vaultPDA,
    });

    const serialized = Buffer.from(tx.serialize()).toString("base64");

    return NextResponse.json(
      { transaction: serialized },
      { headers: ACTIONS_CORS_HEADERS }
    );
  } catch (error) {
    console.error("Actions accept error:", error);
    return NextResponse.json(
      { error: "Failed to build accept transaction" },
      { status: 500, headers: ACTIONS_CORS_HEADERS }
    );
  }
}

export async function OPTIONS() {
  return new Response(null, { headers: ACTIONS_CORS_HEADERS });
}
