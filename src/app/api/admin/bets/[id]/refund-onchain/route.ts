import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { validateAdminAuth } from "@/lib/validators";
import { lamportsToSol } from "@/lib/utils";
import {
  computeBetIdHash,
  deriveBetPDA,
  deriveVaultPDA,
  getConnection,
} from "@/lib/solana/program";

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  if (!validateAdminAuth(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await params;

  try {
    const body = await request.json().catch(() => ({}));
    if (!body.confirmation || body.confirmation !== "REFUND") {
      return NextResponse.json(
        { error: "Missing confirmation. Send { confirmation: 'REFUND' }." },
        { status: 400 }
      );
    }

    const bet = await prisma.bet.findUnique({
      where: { id },
      include: { maker: true, taker: true },
    });
    if (!bet) {
      return NextResponse.json({ error: "Bet not found" }, { status: 404 });
    }

    const refundable = ["OPEN", "ACCEPTED", "DISPUTED", "RESULT_PROPOSED"];
    if (!refundable.includes(bet.status)) {
      return NextResponse.json(
        { error: `Cannot refund bet in ${bet.status} status` },
        { status: 400 }
      );
    }

    const connection = getConnection();
    const betIdHash = computeBetIdHash(bet.id);
    const [betPDA] = deriveBetPDA(betIdHash);
    const [vaultPDA] = deriveVaultPDA(betPDA);

    const vaultBalance = await connection.getBalance(vaultPDA);

    // The on-chain refund_if_expired_or_unresolved requires a 7-day timeout.
    // For admin-initiated refund before timeout, we mark the DB and document
    // that on-chain refund must be executed after the timeout passes.
    // If the bet is OPEN (not accepted), the maker can cancel on-chain via cancel_unaccepted_bet.
    const statusBefore = bet.status;

    await prisma.bet.update({
      where: { id },
      data: {
        status: "REFUNDED",
        needsManualReview: false,
      },
    });

    await prisma.adminActionLog.create({
      data: {
        betId: id,
        action: "REFUND_DB",
        adminIdentity: request.headers.get("x-admin-api-key")?.slice(0, 8) + "...",
        statusBefore,
        statusAfter: "REFUNDED",
        evidenceHash: bet.evidenceHash,
        details: JSON.stringify({
          vault_balance: vaultBalance,
          maker: bet.maker.pubkey,
          taker: bet.taker?.pubkey || null,
          note: vaultBalance > 0
            ? "DB refunded. On-chain vault still holds funds. Execute refund_if_expired_or_unresolved after 7-day timeout, or cancel_unaccepted_bet if no taker."
            : "DB refunded. Vault is empty.",
        }),
      },
    });

    return NextResponse.json({
      bet_id: id,
      status: "REFUNDED",
      vault_balance_sol: lamportsToSol(vaultBalance),
      on_chain_note: vaultBalance > 0
        ? "Vault still holds funds. On-chain refund requires 7-day timeout (refund_if_expired_or_unresolved) or maker cancel (cancel_unaccepted_bet if OPEN)."
        : "Vault is empty. No on-chain action needed.",
    });
  } catch (error) {
    console.error(`[admin-onchain] Refund error for bet ${id}:`, error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Refund failed" },
      { status: 500 }
    );
  }
}
