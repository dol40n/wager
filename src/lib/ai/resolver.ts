import Anthropic from "@anthropic-ai/sdk";
import type { ResolveResult } from "@/types";

const client = new Anthropic();

const SYSTEM_PROMPT = `You are a wager resolution engine. Given a bet's normalized question, YES/NO definitions, deadline, and resolution sources, you must:

1. Research the outcome based on the provided sources and your knowledge.
2. Provide evidence items with source URLs, excerpts, and whether they support YES, NO, or are NEUTRAL.
3. Determine the winner_side: "YES", "NO", or "UNKNOWN".
4. Assign a confidence score from 0 to 1.
5. Set needs_manual_review to true if:
   - confidence < 0.8
   - sources conflict with each other
   - the condition is ambiguous or borderline
   - you cannot find sufficient evidence
6. NEVER fabricate evidence URLs. If you don't have real evidence, use "UNKNOWN" and set needs_manual_review to true.
7. If the event hasn't occurred yet or outcome is unknown, return "UNKNOWN" with needs_manual_review: true.

Respond ONLY with valid JSON matching the ResolveResult schema. No markdown, no extra text.`;

interface BetForResolution {
  id: string;
  normalizedQuestion: string;
  yesDefinition: string;
  noDefinition: string;
  deadlineUtc: string;
  resolutionSources: string[];
  resolutionMethod: string;
  objectiveCriteria: string[];
  category: string;
}

export async function resolveWager(bet: BetForResolution): Promise<ResolveResult> {
  const userMessage = JSON.stringify({
    bet_id: bet.id,
    question: bet.normalizedQuestion,
    yes_definition: bet.yesDefinition,
    no_definition: bet.noDefinition,
    deadline: bet.deadlineUtc,
    resolution_sources: bet.resolutionSources,
    resolution_method: bet.resolutionMethod,
    objective_criteria: bet.objectiveCriteria,
    category: bet.category,
  });

  const response = await client.messages.create({
    model: "claude-sonnet-4-20250514",
    max_tokens: 2048,
    system: SYSTEM_PROMPT,
    messages: [{ role: "user", content: userMessage }],
  });

  const content = response.content[0];
  if (content.type !== "text") {
    throw new Error("Unexpected response type from AI");
  }

  const result: ResolveResult = JSON.parse(content.text);

  if (result.confidence < 0.8) {
    result.needs_manual_review = true;
  }

  const yesCount = result.evidence.filter((e) => e.supports === "YES").length;
  const noCount = result.evidence.filter((e) => e.supports === "NO").length;
  if (yesCount > 0 && noCount > 0) {
    result.needs_manual_review = true;
  }

  return result;
}
