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

    // This legacy route records only an application-state decision. It does not
    // decode the bet account or submit an on-chain instruction.
    const statusBefore = bet.status;
    const onChainNote = vaultBalance === 0
      ? "Vault is empty, but this route did not verify the on-chain bet status."
      : statusBefore === "RESULT_PROPOSED"
      ? "Vault still holds funds. The Anchor refund instruction does not accept ResultProposed; a reviewed on-chain transition is required."
      : "Vault still holds funds. On-chain refund requires the 7-day timeout, or maker cancellation while the wager remains Open."

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
        // Never persist any part of the shared credential in the audit log.
        adminIdentity: "shared-admin-key",
        statusBefore,
        statusAfter: "REFUNDED",
        evidenceHash: bet.evidenceHash,
        details: JSON.stringify({
          vault_balance: vaultBalance,
          maker: bet.maker.pubkey,
          taker: bet.taker?.pubkey || null,
          note: onChainNote,
        }),
      },
    });

    return NextResponse.json({
      bet_id: id,
      status: "REFUNDED",
      vault_balance_sol: lamportsToSol(vaultBalance),
      on_chain_note: onChainNote,
    });
  } catch (error) {
    console.error(`[admin-onchain] Refund error for bet ${id}:`, error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Refund failed" },
      { status: 500 }
    );
  }
}
