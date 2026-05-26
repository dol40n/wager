import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { lamportsToSol } from "@/lib/utils";
import { APP_URL } from "@/lib/constants";

const ACTIONS_CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Access-Control-Allow-Headers":
    "Content-Type, Authorization, Accept-Encoding",
  "Access-Control-Expose-Headers": "X-Action-Version, X-Blockchain-Ids",
  "X-Action-Version": "2.0",
  "X-Blockchain-Ids": "solana:EtWTRABZaYq6iMfeYKouRu166VU2xqa1",
};

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;

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

    const stakeSol = lamportsToSol(bet.stakeLamports);
    const isAcceptable =
      bet.status === "OPEN" &&
      bet.makerFunded &&
      new Date(bet.deadlineUtc).getTime() > Date.now();

    const action = {
      type: "action",
      icon: `${APP_URL}/icon.png`,
      title: `Wager: ${bet.normalizedQuestion}`,
      description: [
        `Stake: ${stakeSol} SOL each side`,
        `YES: ${bet.yesDefinition}`,
        `NO: ${bet.noDefinition}`,
        `Deadline: ${bet.deadlineUtc}`,
        `Maker chose: ${bet.makerSide}`,
        "",
        "WARNING: This is experimental devnet software. Do not use real funds.",
      ].join("\n"),
      label: isAcceptable
        ? "Accept Wager"
        : bet.status !== "OPEN"
        ? `Bet ${bet.status.toLowerCase()}`
        : !bet.makerFunded
        ? "Awaiting maker funding"
        : "Deadline passed",
      disabled: !isAcceptable,
      links: isAcceptable
        ? {
            actions: [
              {
                label: `Accept (${stakeSol} SOL)`,
                href: `${APP_URL}/api/actions/bet/${id}/accept`,
                type: "transaction",
              },
            ],
          }
        : undefined,
    };

    return NextResponse.json(action, { headers: ACTIONS_CORS_HEADERS });
  } catch (error) {
    console.error("Actions GET error:", error);
    return NextResponse.json(
      { error: "Internal error" },
      { status: 500, headers: ACTIONS_CORS_HEADERS }
    );
  }
}

export async function OPTIONS() {
  return new Response(null, { headers: ACTIONS_CORS_HEADERS });
}
