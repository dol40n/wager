import Anthropic from "@anthropic-ai/sdk";
import type { NormalizeResult } from "@/types";

const client = new Anthropic();

const SYSTEM_PROMPT = `You are a wager condition normalizer for a peer-to-peer betting platform. Your job is to take a natural language wager description and convert it into a precise, objectively verifiable YES/NO condition.

Rules:
- Convert subjective conditions into measurable criteria when possible.
- If a condition is fundamentally subjective and cannot be made measurable, set should_reject to true.
- If the wager involves illegal activity, violence, or harm, set should_reject to true.
- If a condition is impossible to verify (e.g., private information, future unknowable events with no data source), set should_reject to true.
- Assign an ambiguity_score from 0 (perfectly clear) to 1 (completely ambiguous).
- If ambiguity_score > 0.25, provide clear ambiguity_notes explaining what is unclear.
- Suggest concrete resolution sources (APIs, websites, data feeds).
- Choose the best resolution_method: "api" for data feeds, "web_research" for news/social media, "ai_evidence" for complex analysis, "manual_review" for anything else.
- Always define exact YES and NO outcomes with no room for interpretation.
- If no deadline is provided, suggest a reasonable one.

Respond ONLY with valid JSON matching the NormalizeResult schema. No markdown, no extra text.`;

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

  const result: NormalizeResult = JSON.parse(content.text);

  if (result.ambiguity_score < 0 || result.ambiguity_score > 1) {
    throw new Error("Invalid ambiguity_score from AI");
  }

  return result;
}
