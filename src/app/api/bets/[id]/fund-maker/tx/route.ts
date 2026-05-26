import { NextResponse } from "next/server";
import { PublicKey } from "@solana/web3.js";
import { prisma } from "@/lib/db";
import { computeBetIdHash, deriveBetPDA, deriveVaultPDA } from "@/lib/solana/program";
import { buildFundMakerTx } from "@/lib/solana/transactions";

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const { maker_pubkey } = await request.json();

    const bet = await prisma.bet.findUnique({
      where: { id },
      include: { maker: true },
    });

    if (!bet) {
      return NextResponse.json({ error: "Bet not found" }, { status: 404 });
    }
    if (bet.status !== "OPEN") {
      return NextResponse.json(
        { error: "Bet is not in OPEN status" },
        { status: 400 }
      );
    }
    if (bet.maker.pubkey !== maker_pubkey) {
      return NextResponse.json({ error: "Not the maker" }, { status: 403 });
    }
    if (bet.makerFunded) {
      return NextResponse.json(
        { error: "Already funded" },
        { status: 400 }
      );
    }

    const betIdHash = computeBetIdHash(bet.id);
    const [betPDA] = deriveBetPDA(betIdHash);
    const [vaultPDA] = deriveVaultPDA(betPDA);

    const tx = await buildFundMakerTx({
      maker: new PublicKey(maker_pubkey),
      betPDA,
      vaultPDA,
    });

    const serialized = Buffer.from(tx.serialize()).toString("base64");

    return NextResponse.json({ transaction: serialized });
  } catch (error) {
    console.error("Fund maker tx error:", error);
    return NextResponse.json(
      { error: "Failed to build fund transaction" },
      { status: 500 }
    );
  }
}
