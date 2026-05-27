import { NextResponse } from "next/server";
import { normalizeRequestSchema } from "@/lib/validators";
import { normalizeWagerCondition } from "@/lib/ai/normalize";
import { isRateLimited } from "@/lib/rate-limit";
import { RATE_LIMIT_MAX_NORMALIZES, REJECTED_TOPICS, UNFALSIFIABLE_TOPICS } from "@/lib/constants";

export async function POST(request: Request) {
  try {
    const ip = request.headers.get("x-forwarded-for") || "unknown";
    if (await isRateLimited(`normalize:${ip}`, RATE_LIMIT_MAX_NORMALIZES)) {
      return NextResponse.json(
        { error: "Rate limit exceeded. Try again in 1 minute." },
        { status: 429 }
      );
    }

    const body = await request.json();
    const parsed = normalizeRequestSchema.parse(body);

    const lower = parsed.text.toLowerCase();
    const blocked = REJECTED_TOPICS.find((t) => lower.includes(t));
    if (blocked) {
      return NextResponse.json({
        original_text: parsed.text,
        normalized_question: "",
        category: "custom",
        yes_definition: "",
        no_definition: "",
        deadline_utc: "",
        resolution_sources: [],
        resolution_method: "manual_review",
        objective_criteria: [],
        ambiguity_score: 1,
        ambiguity_notes: [],
        should_reject: true,
        rejection_reason: `Wager involves prohibited content and cannot be created.`,
      });
    }

    const unfalsifiable = UNFALSIFIABLE_TOPICS.find((t) => lower.includes(t));
    if (unfalsifiable) {
      return NextResponse.json({
        original_text: parsed.text,
        normalized_question: "",
        category: "custom",
        yes_definition: "",
        no_definition: "",
        deadline_utc: "",
        resolution_sources: [],
        resolution_method: "manual_review",
        objective_criteria: [],
        ambiguity_score: 1,
        ambiguity_notes: ["This topic has no objective verification criteria."],
        should_reject: true,
        rejection_reason: "This wager cannot be objectively verified. Outcomes must be checkable against a public data source (news, API, official record).",
      });
    }

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
