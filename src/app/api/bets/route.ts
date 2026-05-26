import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";

export async function GET(request: Request) {
  try {
    const url = new URL(request.url);
    const status = url.searchParams.get("status");
    const maker = url.searchParams.get("maker");
    const limit = Math.min(parseInt(url.searchParams.get("limit") || "50"), 100);
    const offset = parseInt(url.searchParams.get("offset") || "0");

    const where: Record<string, unknown> = {};
    if (status) where.status = status;
    if (maker) where.maker = { pubkey: maker };

    const [bets, total] = await Promise.all([
      prisma.bet.findMany({
        where,
        include: { maker: true, taker: true },
        orderBy: { createdAt: "desc" },
        take: limit,
        skip: offset,
      }),
      prisma.bet.count({ where }),
    ]);

    return NextResponse.json({
      bets: bets.map((b) => ({
        ...b,
        stakeLamports: b.stakeLamports.toString(),
      })),
      total,
      limit,
      offset,
    });
  } catch (error) {
    console.error("List bets error:", error);
    return NextResponse.json(
      { error: "Failed to list bets" },
      { status: 500 }
    );
  }
}
