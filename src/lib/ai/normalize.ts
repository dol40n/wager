import Anthropic from "@anthropic-ai/sdk";
import { z } from "zod";
import type { NormalizeResult } from "@/types";

const client = new Anthropic();

const SYSTEM_PROMPT = `You are a wager condition normalizer for a peer-to-peer betting platform. Your job is to take a natural language wager description and convert it into a precise, objectively verifiable YES/NO condition.

CRITICAL — YES and NO must be exact logical complements:
- If YES is true, NO must be false. If NO is true, YES must be false.
- There must be no gap and no overlap between the two definitions.

For price/metric wagers, choose ONE of these two framings:

1. SNAPSHOT AT DEADLINE (default for "at", "on", "as of"):
   YES: "[metric] is strictly above [target] at [deadline] according to [single source]"
   NO:  "[metric] is at or below [target] at [deadline] according to [single source]"

2. THRESHOLD BEFORE DEADLINE (for "by", "before", "reaches", "hits"):
   YES: "[metric] reaches or exceeds [target] at any point on or before [deadline] according to [single source]"
   NO:  "[metric] never reaches [target] at any point on or before [deadline] according to [single source]"

For event wagers (sports, news, etc.):
   YES: "[event] occurs on or before [deadline] according to [single source]"
   NO:  "[event] does not occur on or before [deadline] according to [single source]"

Resolution source rules:
- Use exactly ONE primary resolution source.
- Pick the most authoritative: CoinGecko for crypto prices, ESPN for sports, official government sites for elections, etc.
- Do NOT list multiple sources unless you also define explicit fallback order.

Other rules:
- If a condition is fundamentally subjective and cannot be made measurable, set should_reject to true.
- If the wager involves illegal activity, violence, or harm, set should_reject to true.
- If a condition is impossible to verify, set should_reject to true.
- Assign ambiguity_score from 0 (perfectly clear) to 1 (completely ambiguous).
- If ambiguity_score > 0.25, provide ambiguity_notes explaining what is unclear.
- If no deadline is provided, suggest a reasonable one.

You MUST respond with a JSON object using EXACTLY these field names:
{
  "original_text": "<the original wager text>",
  "normalized_question": "<precise YES/NO question>",
  "category": "crypto" | "sports" | "social_media" | "news" | "custom",
  "yes_definition": "<exact condition for YES>",
  "no_definition": "<exact condition for NO — must be logical complement of yes_definition>",
  "deadline_utc": "<ISO 8601 datetime>",
  "resolution_sources": ["<single primary source>"],
  "resolution_method": "api" | "web_research" | "ai_evidence" | "manual_review",
  "objective_criteria": ["<criterion1>"],
  "ambiguity_score": 0.0,
  "ambiguity_notes": [],
  "should_reject": false,
  "rejection_reason": null
}

Respond ONLY with valid JSON. No markdown, no commentary, no code fences.`;

const normalizeResultSchema = z.object({
  original_text: z.string(),
  normalized_question: z.string(),
  category: z.enum(["crypto", "sports", "social_media", "news", "custom"]),
  yes_definition: z.string(),
  no_definition: z.string(),
  deadline_utc: z.string(),
  resolution_sources: z.array(z.string()).min(1),
  resolution_method: z.enum(["api", "web_research", "ai_evidence", "manual_review"]),
  objective_criteria: z.array(z.string()),
  ambiguity_score: z.number().min(0).max(1),
  ambiguity_notes: z.array(z.string()),
  should_reject: z.boolean(),
  rejection_reason: z.string().nullable(),
});

export async function normalizeWagerCondition(
  text: string,
  suggestedDeadline?: string
): Promise<NormalizeResult> {
  const userMessage = suggestedDeadline
    ? `Wager: "${text}"\nSuggested deadline: ${suggestedDeadline}`
    : `Wager: "${text}"`;

  const response = await client.messages.create({
    model: "claude-sonnet-4-20250514",
    max_tokens: 1024,
    system: SYSTEM_PROMPT,
    messages: [{ role: "user", content: userMessage }],
  });

  const content = response.content[0];
  if (content.type !== "text") {
    throw new Error("Unexpected response type from AI");
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(content.text);
  } catch {
    console.error("[normalize] AI returned invalid JSON");
    throw new Error("AI returned invalid JSON");
  }

  const validation = normalizeResultSchema.safeParse(parsed);
  if (!validation.success) {
    console.error("[normalize] Schema validation failed:", validation.error.issues);
    throw new Error(
      "AI response schema mismatch: " +
      validation.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("; ")
    );
  }

  return validation.data as NormalizeResult;
}
