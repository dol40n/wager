import { NextResponse } from "next/server";

export async function GET() {
  const payload = {
    rules: [
      {
        pathPattern: "/api/actions/bet/*",
        apiPath: "/api/actions/bet/*",
      },
    ],
  };

  return NextResponse.json(payload, {
    headers: {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "GET, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type",
      "X-Action-Version": "2.0",
      "X-Blockchain-Ids": "solana:EtWTRABZaYq6iMfeYKouRu166VU2xqa1",
    },
  });
}

export async function OPTIONS() {
  return new Response(null, {
    headers: {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "GET, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type",
    },
  });
}
