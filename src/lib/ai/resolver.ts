import Anthropic from "@anthropic-ai/sdk";
import { z } from "zod";
import type { ResolveResult, EvidenceItem } from "@/types";

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
8. Every evidence item MUST have a non-empty source_url and source_name.

Respond ONLY with valid JSON matching the ResolveResult schema. No markdown, no extra text.`;

const evidenceItemSchema = z.object({
  source_url: z.string().min(1),
  source_name: z.string().min(1),
  published_or_observed_at: z.string().nullable(),
  relevant_excerpt: z.string().min(1),
  supports: z.enum(["YES", "NO", "NEUTRAL"]),
  explanation: z.string().min(1),
});

const resolveResultSchema = z.object({
  bet_id: z.string(),
  winner_side: z.enum(["YES", "NO", "UNKNOWN"]),
  confidence: z.number().min(0).max(1),
  needs_manual_review: z.boolean(),
  evidence: z.array(evidenceItemSchema),
  reasoning_summary: z.string(),
  failure_reason: z.string().nullable(),
});

export interface BetForResolution {
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

export function canonicalizeEvidence(evidence: EvidenceItem[]): string {
  const sorted = [...evidence].sort((a, b) =>
    a.source_url.localeCompare(b.source_url)
  );
  return JSON.stringify(sorted);
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

  console.log(`[resolver] Starting resolution for bet ${bet.id}`);

  const response = await client.messages.create({
    model: "claude-sonnet-4-20250514",
    max_tokens: 2048,
    system: SYSTEM_PROMPT,
    messages: [{ role: "user", content: userMessage }],
  });

  const content = response.content[0];
  if (content.type !== "text") {
    console.error(`[resolver] Unexpected response type: ${content.type}`);
    throw new Error("Unexpected response type from AI");
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(content.text);
  } catch {
    console.error(`[resolver] Failed to parse AI response as JSON`);
    throw new Error("AI returned invalid JSON");
  }

  const validation = resolveResultSchema.safeParse(parsed);
  if (!validation.success) {
    console.error(`[resolver] Schema validation failed:`, validation.error.issues);
    return {
      bet_id: bet.id,
      winner_side: "UNKNOWN",
      confidence: 0,
      needs_manual_review: true,
      evidence: [],
      reasoning_summary: "AI response failed schema validation",
      failure_reason: validation.error.issues.map((i) => i.message).join("; "),
    };
  }

  const result = validation.data as ResolveResult;

  if (result.confidence < 0.8) {
    result.needs_manual_review = true;
    console.log(`[resolver] Low confidence (${result.confidence}) — flagged for manual review`);
  }

  const yesCount = result.evidence.filter((e) => e.supports === "YES").length;
  const noCount = result.evidence.filter((e) => e.supports === "NO").length;
  if (yesCount > 0 && noCount > 0) {
    result.needs_manual_review = true;
    console.log(`[resolver] Conflicting evidence (${yesCount} YES, ${noCount} NO) — flagged for manual review`);
  }

  if (result.evidence.some((e) => !e.source_url || e.source_url.length === 0)) {
    result.needs_manual_review = true;
    console.log(`[resolver] Evidence missing source URL — flagged for manual review`);
  }

  console.log(`[resolver] Bet ${bet.id}: winner=${result.winner_side}, confidence=${result.confidence}, review=${result.needs_manual_review}`);

  return result;
}
