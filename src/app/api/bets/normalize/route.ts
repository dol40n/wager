import { NextResponse } from "next/server";
import { normalizeRequestSchema } from "@/lib/validators";
import { normalizeWagerCondition } from "@/lib/ai/normalize";

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const parsed = normalizeRequestSchema.parse(body);

    const result = await normalizeWagerCondition(
      parsed.text,
      parsed.deadline_utc
    );

    return NextResponse.json(result);
  } catch (error) {
    if (error instanceof Error && error.name === "ZodError") {
      return NextResponse.json(
        { error: "Invalid request", details: error.message },
        { status: 400 }
      );
    }
    console.error("Normalize error:", error);
    return NextResponse.json(
      { error: "Failed to normalize wager condition" },
      { status: 500 }
    );
  }
}
