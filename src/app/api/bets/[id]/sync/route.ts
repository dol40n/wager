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
  const { id } = await params;
  const isAdmin = validateAdminAuth(request);

  try {
    const body = await request.json().catch(() => ({}));
    const forcedStatus = body.status as string | undefined;
    const forcedTaker = body.taker_pubkey as string | undefined;

    // Forced status/taker overrides require admin auth
    if ((forcedStatus || forcedTaker) && !isAdmin) {
      return NextResponse.json({ error: "Admin auth required for status override" }, { status: 401 });
    }

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

    // Admin forced overrides — validate status is a real enum value.
    // FINALIZED is blocked here: it must go through on-chain settlement
    // (finalize-onchain) which verifies the vault is drained first.
    const VALID_STATUSES = ["OPEN", "ACCEPTED", "RESULT_PROPOSED", "DISPUTED", "CANCELLED", "REFUNDED"];
    if (forcedStatus && isAdmin) {
      if (!VALID_STATUSES.includes(forcedStatus)) {
        return NextResponse.json(
          { error: `Invalid status. FINALIZED requires on-chain settlement via finalize-onchain. Allowed: ${VALID_STATUSES.join(", ")}` },
          { status: 400 }
        );
      }
      updates.status = forcedStatus;
    }
    if (forcedTaker && isAdmin && !bet.takerId) {
      let takerWallet = await prisma.userWallet.findUnique({ where: { pubkey: forcedTaker } });
      if (!takerWallet) {
        takerWallet = await prisma.userWallet.create({ data: { pubkey: forcedTaker } });
      }
      updates.takerId = takerWallet.id;
    }

    // Chain-read sync (no admin needed)
    if (!forcedStatus) {
      // Detect makerFunded from vault balance
      if (vaultBalance >= Number(bet.stakeLamports) && !bet.makerFunded) {
        updates.makerFunded = true;
      }

      // Read on-chain account to detect status + taker
      const accountInfo = await connection.getAccountInfo(betPDA);
      if (accountInfo && accountInfo.data.length > 100) {
        const data = accountInfo.data;
        let offset = 8 + 32 + 32; // disc + hash + maker
        const takerFlag = data[offset];
        let takerPubkey: string | null = null;
        if (takerFlag === 1) {
          takerPubkey = new PublicKey(data.subarray(offset + 1, offset + 33)).toBase58();
        }
        offset += takerFlag === 1 ? 33 : 1; // taker
        const allowedFlag = data[offset];
        offset += allowedFlag === 1 ? 33 : 1; // allowed_taker
        offset += 1; // maker_side
        offset += 8; // stake
        offset += 8; // deadline
        offset += 8; // dispute_deadline
        const statusByte = data[offset];

        const STATUS_MAP: Record<number, string> = {
          0: "OPEN", 1: "ACCEPTED", 2: "RESULT_PROPOSED",
          3: "DISPUTED", 4: "FINALIZED", 5: "CANCELLED", 6: "REFUNDED",
        };
        const chainStatus = STATUS_MAP[statusByte];

        if (chainStatus && chainStatus !== bet.status) {
          updates.status = chainStatus;
        }

        if (takerPubkey && !bet.takerId) {
          let takerWallet = await prisma.userWallet.findUnique({ where: { pubkey: takerPubkey } });
          if (!takerWallet) {
            takerWallet = await prisma.userWallet.create({ data: { pubkey: takerPubkey } });
          }
          updates.takerId = takerWallet.id;
        }
      }
    }

    if (Object.keys(updates).length > 0) {
      await prisma.bet.update({ where: { id }, data: updates });
    }

    return NextResponse.json({
      bet_id: id,
      synced: true,
      db_status_before: dbStatusBefore,
      db_status_after: (updates.status as string) || dbStatusBefore,
      vault_balance_lamports: vaultBalance,
      updates: Object.keys(updates),
    });
  } catch (error) {
    console.error("Sync error:", error);
    return NextResponse.json(
      { error: "Failed to sync" },
      { status: 500 }
    );
  }
}
