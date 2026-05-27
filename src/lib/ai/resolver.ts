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
  source_url: z.string().default(""),
  source_name: z.string().default("unknown"),
  published_or_observed_at: z.string().nullable().default(null),
  relevant_excerpt: z.string().default(""),
  supports: z.enum(["YES", "NO", "NEUTRAL"]).default("NEUTRAL"),
  explanation: z.string().default(""),
});

const resolveResultSchema = z.object({
  bet_id: z.string().optional().default(""),
  winner_side: z.enum(["YES", "NO", "UNKNOWN"]).default("UNKNOWN"),
  confidence: z.number().min(0).max(1).default(0),
  needs_manual_review: z.boolean().default(true),
  evidence: z.array(evidenceItemSchema).default([]),
  reasoning_summary: z.string().default(""),
  failure_reason: z.string().nullable().default(null),
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
  snapshotSource?: string | null;
  snapshotSymbol?: string | null;
  snapshotPrice?: number | null;
  snapshotTimeUtc?: string | null;
}

export function canonicalizeEvidence(evidence: EvidenceItem[]): string {
  const sorted = [...evidence].sort((a, b) =>
    a.source_url.localeCompare(b.source_url)
  );
  return JSON.stringify(sorted);
}

async function resolveCryptoPriceComparison(
  bet: BetForResolution
): Promise<ResolveResult | null> {
  if (
    bet.category !== "crypto" ||
    bet.resolutionMethod !== "API" ||
    !bet.snapshotSymbol ||
    !bet.snapshotPrice ||
    !bet.snapshotTimeUtc
  ) {
    return null;
  }

  console.log(
    `[resolver] Crypto price comparison: ${bet.snapshotSymbol} snapshot=$${bet.snapshotPrice} at ${bet.snapshotTimeUtc}`
  );

  try {
    const { fetchBinancePrice } = await import("@/lib/price-snapshot");
    const current = await fetchBinancePrice(bet.snapshotSymbol);
    const startPrice = bet.snapshotPrice;
    const endPrice = current.snapshot_price;
    const priceUp = endPrice > startPrice;
    const priceSame = endPrice === startPrice;

    const yesMeansUp =
      bet.yesDefinition.toLowerCase().includes("higher") ||
      bet.yesDefinition.toLowerCase().includes("выше") ||
      bet.yesDefinition.toLowerCase().includes("strictly higher");

    let winnerSide: "YES" | "NO";
    if (yesMeansUp) {
      winnerSide = priceUp ? "YES" : "NO";
    } else {
      winnerSide = priceUp ? "NO" : "YES";
    }

    // Exact same price → NO wins (not strictly higher)
    if (priceSame) {
      winnerSide = yesMeansUp ? "NO" : "YES";
    }

    const evidence: EvidenceItem[] = [
      {
        source_url: `https://api.binance.com/api/v3/ticker/price?symbol=${bet.snapshotSymbol}`,
        source_name: "Binance API (start)",
        published_or_observed_at: bet.snapshotTimeUtc,
        relevant_excerpt: `${bet.snapshotSymbol} = $${startPrice.toFixed(2)} at wager creation`,
        supports: "NEUTRAL",
        explanation: `Reference price at wager creation time`,
      },
      {
        source_url: `https://api.binance.com/api/v3/ticker/price?symbol=${bet.snapshotSymbol}`,
        source_name: "Binance API (end)",
        published_or_observed_at: current.snapshot_time_utc,
        relevant_excerpt: `${bet.snapshotSymbol} = $${endPrice.toFixed(2)} at resolution`,
        supports: winnerSide === "YES" ? "YES" : "NO",
        explanation: `Price ${priceUp ? "increased" : priceSame ? "unchanged" : "decreased"}: $${startPrice.toFixed(2)} → $${endPrice.toFixed(2)} (${((endPrice - startPrice) / startPrice * 100).toFixed(2)}%)`,
      },
    ];

    console.log(
      `[resolver] Binance result: $${startPrice.toFixed(2)} → $${endPrice.toFixed(2)}, winner=${winnerSide}`
    );

    return {
      bet_id: bet.id,
      winner_side: winnerSide,
      confidence: 0.99,
      needs_manual_review: false,
      evidence,
      reasoning_summary: `${bet.snapshotSymbol} price moved from $${startPrice.toFixed(2)} to $${endPrice.toFixed(2)} (${((endPrice - startPrice) / startPrice * 100).toFixed(2)}%). ${winnerSide} wins.`,
      failure_reason: null,
    };
  } catch (err) {
    console.error(`[resolver] Binance price fetch failed:`, err);
    return null;
  }
}

export async function resolveWager(bet: BetForResolution): Promise<ResolveResult> {
  // Try deterministic crypto price resolution first
  const cryptoResult = await resolveCryptoPriceComparison(bet);
  if (cryptoResult) return cryptoResult;

  // Web search for evidence before AI analysis
  const { searchWeb } = await import("@/lib/web-search");
  const searchQuery = `${bet.normalizedQuestion} ${bet.objectiveCriteria.join(" ")} ${bet.deadlineUtc}`;
  const webResults = await searchWeb(searchQuery);

  console.log(`[resolver] Web search returned ${webResults.length} results for bet ${bet.id}`);

  const searchContext = webResults.length > 0
    ? "\n\nWEB SEARCH RESULTS (use these as evidence):\n" +
      webResults.map((r, i) =>
        `[${i + 1}] ${r.title}\n    URL: ${r.url}\n    ${r.content.slice(0, 300)}${r.published_date ? `\n    Published: ${r.published_date}` : ""}`
      ).join("\n\n")
    : "\n\nNo web search results found. If you cannot determine the outcome from your knowledge, return UNKNOWN with needs_manual_review: true.";

  const betData = JSON.stringify({
    bet_id: bet.id,
    question: bet.normalizedQuestion,
    yes_definition: bet.yesDefinition,
    no_definition: bet.noDefinition,
    deadline: bet.deadlineUtc,
    resolution_sources: bet.resolutionSources,
    resolution_method: bet.resolutionMethod,
    objective_criteria: bet.objectiveCriteria,
    category: bet.category,
  }, null, 2);

  const userMessage = `BET DATA:\n${betData}\n${searchContext}\n\nRespond ONLY with valid JSON matching the schema. No markdown.`;

  console.log(`[resolver] Starting AI resolution for bet ${bet.id}`);

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
