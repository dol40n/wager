import Anthropic from "@anthropic-ai/sdk";
import { z } from "zod";
import type { NormalizeResult } from "@/types";

const client = new Anthropic();

const MIN_DEADLINE_BUFFER_MS = 60_000; // 1 minute minimum

function buildSystemPrompt(): string {
  const now = new Date();
  return `You are a wager condition normalizer for a peer-to-peer betting platform. Your job is to take a natural language wager description and convert it into a precise, objectively verifiable YES/NO condition.

CURRENT SERVER TIME: ${now.toISOString()}
CURRENT YEAR: ${now.getUTCFullYear()}

TIME RULES (CRITICAL):
- The current year is ${now.getUTCFullYear()}. NEVER assume an earlier year.
- If the user omits the year, assume the NEXT occurrence of that date in the future relative to the current server time above.
- If the user says a relative time like "in 5 minutes", "through 10 minutes", "через 5 минут", compute deadline_utc = current server time + the interval.
- The deadline_utc you return MUST be in the future. If you cannot produce a future deadline, set should_reject = true with rejection_reason = "Cannot determine a future deadline."

CRITICAL — YES and NO must be exact logical complements:
- If YES is true, NO must be false. If NO is true, YES must be false.
- There must be no gap and no overlap between the two definitions.

DIRECTIONAL WAGERS (price goes up/down, "вверх или вниз", "long or short"):
- Do NOT auto-assign YES to "up" or "down".
- Set ambiguity_score >= 0.3 and add an ambiguity_note: "Directional wager — maker must choose UP or DOWN as their side."
- Frame as price_direction:
  For UP side (maker chooses YES=UP):
    YES: "[asset] price at [deadline] is strictly higher than price at ${now.toISOString()} according to [source]"
    NO:  "[asset] price at [deadline] is equal to or lower than price at ${now.toISOString()} according to [source]"
  For DOWN side (maker chooses YES=DOWN):
    YES: "[asset] price at [deadline] is strictly lower than price at ${now.toISOString()} according to [source]"
    NO:  "[asset] price at [deadline] is equal to or higher than price at ${now.toISOString()} according to [source]"
- Include "start_price_reference_time" in objective_criteria.

For price/metric wagers, choose ONE of these framings:

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
- For crypto prices with intervals under 1 hour, prefer Binance API (1-minute candle granularity).
- For crypto prices with longer intervals, use CoinGecko.
- For sports, use ESPN. For elections, use official government sites.
- Do NOT list multiple sources unless you define explicit fallback order.

PRICE RULES (CRITICAL):
- NEVER invent, guess, or look up a "current price" to use as a threshold. You do not have access to live market data.
- If the user says "current price", "at current level", "from now", or implies a comparison to an unspecified reference price, set should_reject = true with rejection_reason = "Missing reference price. Specify an explicit USD target (e.g. 'above $110,000'), or state 'use current price at creation' so the system can fetch a deterministic snapshot."
- If the wager says "higher" / "выше" / "up" WITHOUT a specific dollar target, it is a missing-reference-price wager. Set should_reject = true with rejection_reason = "Higher than what? Specify an explicit price target or reference point." Add ambiguity_note: "Clarify: use price at interval start, current price at creation, or a fixed USD amount."
- Words like "approximately", "примерно", "около", "roughly", "around" require an explicit tolerance. Set should_reject = true with rejection_reason = "Approximate conditions need an explicit tolerance (e.g. 'within 5%' or 'within $1000'). Please clarify."
- ALL dates and times in the output MUST use ISO 8601 UTC format: "2026-05-26T07:20:00Z". Never use localized formats like "26.05.2026 07:20:00" in any field.

Ambiguity rules:
- Assign ambiguity_score from 0 (perfectly clear) to 1 (completely ambiguous).
- If ambiguity_score > 0.25, set should_reject = true with rejection_reason explaining what needs clarification.
- If a condition is fundamentally subjective, set should_reject = true.
- If illegal/violent/harmful, set should_reject = true.

Unfalsifiable / unverifiable wagers:
- REJECT any wager where the outcome cannot be verified by a publicly accessible, objective data source.
- Examples: religious prophecies, supernatural events, personal feelings, philosophical claims, conspiracy theories, afterlife, paranormal activity.
- The test: "Could a neutral third party verify this outcome using a specific website, API, or official record?" If NO → reject.
- Set should_reject = true with rejection_reason = "This wager has no objective verification criteria. Outcomes must be verifiable by a publicly accessible data source (news site, API, official record)."
- If the wager is about the ABSENCE of an extraordinary event (e.g. "aliens won't contact Earth"), also reject — the absence of an unfalsifiable event is itself unfalsifiable.

You MUST respond with a JSON object using EXACTLY these field names:
{
  "original_text": "<the original wager text>",
  "normalized_question": "<precise YES/NO question>",
  "category": "crypto" | "sports" | "social_media" | "news" | "custom",
  "yes_definition": "<exact condition for YES>",
  "no_definition": "<exact condition for NO — must be logical complement of yes_definition>",
  "deadline_utc": "<ISO 8601 datetime — MUST be in the future>",
  "resolution_sources": ["<single primary source>"],
  "resolution_method": "api" | "web_research" | "ai_evidence" | "manual_review",
  "objective_criteria": ["<criterion1>"],
  "ambiguity_score": 0.0,
  "ambiguity_notes": [],
  "should_reject": false,
  "rejection_reason": null
}

Respond ONLY with valid JSON. No markdown, no commentary, no code fences.`;
}

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

  const normalizeTool = {
    name: "submit_normalized_wager" as const,
    description: "Submit the normalized wager condition",
    input_schema: {
      type: "object" as const,
      properties: {
        original_text: { type: "string" as const },
        normalized_question: { type: "string" as const },
        category: { type: "string" as const, enum: ["crypto", "sports", "social_media", "news", "custom"] },
        yes_definition: { type: "string" as const },
        no_definition: { type: "string" as const },
        deadline_utc: { type: "string" as const },
        resolution_sources: { type: "array" as const, items: { type: "string" as const } },
        resolution_method: { type: "string" as const, enum: ["api", "web_research", "ai_evidence", "manual_review"] },
        objective_criteria: { type: "array" as const, items: { type: "string" as const } },
        ambiguity_score: { type: "number" as const },
        ambiguity_notes: { type: "array" as const, items: { type: "string" as const } },
        should_reject: { type: "boolean" as const },
        rejection_reason: { type: ["string", "null"] as const },
      },
      required: [
        "original_text", "normalized_question", "category", "yes_definition",
        "no_definition", "deadline_utc", "resolution_sources", "resolution_method",
        "objective_criteria", "ambiguity_score", "ambiguity_notes", "should_reject",
        "rejection_reason",
      ],
    },
  };

  const response = await client.messages.create({
    model: "claude-sonnet-4-20250514",
    max_tokens: 1024,
    system: buildSystemPrompt(),
    messages: [{ role: "user", content: userMessage }],
    tools: [normalizeTool],
    tool_choice: { type: "tool", name: "submit_normalized_wager" },
  });

  const toolBlock = response.content.find((c) => c.type === "tool_use");
  if (!toolBlock || toolBlock.type !== "tool_use") {
    throw new Error("AI did not return structured tool output");
  }

  const validation = normalizeResultSchema.safeParse(toolBlock.input);
  if (!validation.success) {
    console.error("[normalize] Schema validation failed:", validation.error.issues);
    throw new Error(
      "AI response schema mismatch: " +
      validation.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("; ")
    );
  }

  const result = validation.data as NormalizeResult;

  // Server-side past deadline guard
  if (!result.should_reject) {
    const deadlineMs = new Date(result.deadline_utc).getTime();
    if (isNaN(deadlineMs)) {
      result.should_reject = true;
      result.rejection_reason = "Could not parse deadline as a valid date.";
    } else if (deadlineMs <= Date.now() + MIN_DEADLINE_BUFFER_MS) {
      result.should_reject = true;
      result.rejection_reason =
        "Deadline is in the past or too close to the current time. Please choose a future deadline.";
    }
  }

  // Server-side unfalsifiable guard: reject if no concrete criteria
  if (!result.should_reject) {
    const criteria = result.objective_criteria.join(" ").toLowerCase();
    const sources = result.resolution_sources.join(" ").toLowerCase();
    const hasConcreteSource = sources.length > 3 &&
      !["common knowledge", "general observation", "personal judgment", "general knowledge"].some((v) => sources.includes(v));
    const hasConcreteCriteria = result.objective_criteria.length > 0 && criteria.length > 10;

    if (!hasConcreteSource || !hasConcreteCriteria) {
      result.should_reject = true;
      result.rejection_reason = "No verifiable resolution source or objective criteria. Wager outcomes must be checkable against a specific public data source.";
      result.ambiguity_score = Math.max(result.ambiguity_score, 0.8);
    }
  }

  // Server-side ambiguity guard
  if (!result.should_reject && result.ambiguity_score > 0.25) {
    result.should_reject = true;
    if (!result.rejection_reason) {
      result.rejection_reason =
        "Ambiguity score too high (" +
        result.ambiguity_score.toFixed(2) +
        "). " +
        (result.ambiguity_notes.length > 0
          ? result.ambiguity_notes.join(" ")
          : "Please clarify the condition.");
    }
  }

  return result;
}
