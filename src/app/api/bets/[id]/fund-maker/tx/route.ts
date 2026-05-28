import { NextResponse } from "next/server";
import { PublicKey } from "@solana/web3.js";
import { prisma } from "@/lib/db";
import {
  computeBetIdHash,
  deriveBetPDA,
  deriveVaultPDA,
  getConnection,
  getResolverPublicKey,
} from "@/lib/solana/program";
import { buildFundMakerTx, buildInitializeAndFundTx } from "@/lib/solana/transactions";

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
      return NextResponse.json({ error: "Bet is not in OPEN status" }, { status: 400 });
    }
    if (bet.maker.pubkey !== maker_pubkey) {
      return NextResponse.json({ error: "Not the maker" }, { status: 403 });
    }
    if (bet.makerFunded) {
      return NextResponse.json({ error: "Already funded" }, { status: 400 });
    }

    const betIdHash = computeBetIdHash(bet.id);
    const [betPDA] = deriveBetPDA(betIdHash);
    const [vaultPDA] = deriveVaultPDA(betPDA);
    const connection = getConnection();

    const accountInfo = await connection.getAccountInfo(betPDA);
    const needsInit = !accountInfo;

    let tx;
    if (needsInit) {
      let resolverAuthority: PublicKey;
      try {
        resolverAuthority = getResolverPublicKey();
      } catch {
        return NextResponse.json(
          { error: "Resolver authority not configured on server" },
          { status: 500 }
        );
      }

      const deadlineTs = Math.floor(new Date(bet.deadlineUtc).getTime() / 1000);
      tx = await buildInitializeAndFundTx({
        maker: new PublicKey(maker_pubkey),
        betIdHash,
        makerSide: bet.makerSide === "YES" ? "yes" : "no",
        stakeLamports: Number(bet.stakeLamports),
        deadlineTs,
        feeBps: bet.feeBps,
        resolverAuthority,
        allowedTaker: bet.allowedTaker ? new PublicKey(bet.allowedTaker) : null,
        betPDA,
        vaultPDA,
      });
    } else {
      tx = await buildFundMakerTx({
        maker: new PublicKey(maker_pubkey),
        betPDA,
        vaultPDA,
      });
    }

    const serialized = Buffer.from(tx.serialize()).toString("base64");

    return NextResponse.json({
      transaction: serialized,
      includes_initialize: needsInit,
    });
  } catch (error) {
    console.error("Fund maker tx error:", error);
    return NextResponse.json(
      { error: "Failed to build fund transaction" },
      { status: 500 }
    );
  }
}
