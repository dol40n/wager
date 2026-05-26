import { NextResponse } from "next/server";
import { PublicKey } from "@solana/web3.js";
import { prisma } from "@/lib/db";
import { validateAdminAuth } from "@/lib/validators";
import {
  computeBetIdHash,
  deriveBetPDA,
  getConnection,
} from "@/lib/solana/program";
import { PROGRAM_ID } from "@/lib/constants";

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  if (!validateAdminAuth(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const { id } = await params;
    const body = await request.json().catch(() => ({}));
    const forcedStatus = body.status as string | undefined;

    const bet = await prisma.bet.findUnique({ where: { id } });
    if (!bet) {
      return NextResponse.json({ error: "Bet not found" }, { status: 404 });
    }

    const betIdHash = computeBetIdHash(bet.id);
    const [betPDA] = deriveBetPDA(betIdHash);
    const [vaultPDA] = PublicKey.findProgramAddressSync(
      [Buffer.from("vault"), betPDA.toBuffer()],
      PROGRAM_ID
    );
    const connection = getConnection();

    const vaultBalance = await connection.getBalance(vaultPDA);
    const dbStatusBefore = bet.status;

    const updates: Record<string, unknown> = {};

    if (forcedStatus) {
      updates.status = forcedStatus;
    }

    if (vaultBalance >= Number(bet.stakeLamports) && !bet.makerFunded) {
      updates.makerFunded = true;
    }

    if (body.taker_pubkey && !bet.takerId) {
      let takerWallet = await prisma.userWallet.findUnique({
        where: { pubkey: body.taker_pubkey },
      });
      if (!takerWallet) {
        takerWallet = await prisma.userWallet.create({
          data: { pubkey: body.taker_pubkey },
        });
      }
      updates.takerId = takerWallet.id;
    }

    if (Object.keys(updates).length > 0) {
      await prisma.bet.update({ where: { id }, data: updates });
    }

    return NextResponse.json({
      bet_id: id,
      synced: true,
      db_status_before: dbStatusBefore,
      db_status_after: forcedStatus || dbStatusBefore,
      vault_balance_lamports: vaultBalance,
      updates: Object.keys(updates),
    });
  } catch (error) {
    console.error("Sync error:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to sync" },
      { status: 500 }
    );
  }
}
