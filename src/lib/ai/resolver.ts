import Anthropic from "@anthropic-ai/sdk";
import { z } from "zod";
import type { ResolveResult, EvidenceItem } from "@/types";
import { prisma } from "@/lib/db";

const client = new Anthropic();

function buildSystemPrompt(): string {
  const now = new Date().toISOString();
  return `You are a wager resolution engine. CURRENT_DATE_UTC: ${now}

Given a bet's normalized question, YES/NO definitions, deadline, and resolution sources, you must:

1. Analyze the provided web search results as primary evidence. Cross-reference multiple sources when possible.
2. Provide evidence items with source URLs, excerpts, and whether they support YES, NO, or are NEUTRAL.
3. Determine the winner_side: "YES", "NO", or "UNKNOWN".
4. Assign a confidence score from 0 to 1:
   - 0.95+ : Multiple independent sources confirm the same outcome
   - 0.85-0.94 : One strong authoritative source confirms the outcome
   - 0.70-0.84 : Evidence suggests an outcome but with some uncertainty
   - Below 0.70 : Insufficient or conflicting evidence
5. Set needs_manual_review to true if:
   - confidence < 0.8
   - sources conflict with each other
   - the condition is ambiguous or borderline
   - you cannot find sufficient evidence
   - the deadline has not yet passed (event may not have occurred)
6. NEVER fabricate evidence URLs. Only use URLs from the provided web search results. If no search results are provided, use "UNKNOWN" and set needs_manual_review to true.
7. If the event hasn't occurred yet or outcome is unknown, return "UNKNOWN" with needs_manual_review: true.
8. Every evidence item MUST have a non-empty source_url and source_name.
9. In reasoning_summary, explain WHY the evidence supports the outcome, not just WHAT the outcome is.

Respond ONLY with valid JSON matching the ResolveResult schema. No markdown, no extra text.`;
}

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
    const endPrice = current.snapshot_price;

    // Extract explicit dollar target from yes_definition (e.g. "above $110,000")
    const targetMatch = bet.yesDefinition.match(/\$[\s]*([\d,]+(?:\.\d+)?)/);
    const targetPrice = targetMatch
      ? parseFloat(targetMatch[1].replace(/,/g, ""))
      : null;

    const startPrice = bet.snapshotPrice;
    const isTargetPriceBet = targetPrice !== null && targetPrice !== startPrice;

    const yesDef = bet.yesDefinition.toLowerCase();
    const yesAbove =
      yesDef.includes("above") ||
      yesDef.includes("higher") ||
      yesDef.includes("выше") ||
      yesDef.includes("больше");
    const yesBelow =
      yesDef.includes("below") ||
      yesDef.includes("lower") ||
      yesDef.includes("ниже") ||
      yesDef.includes("меньше");

    let winnerSide: "YES" | "NO";
    let comparisonPrice: number;
    let comparisonLabel: string;

    if (isTargetPriceBet) {
      // Fixed target: "BTC above $110k" — compare current vs target
      comparisonPrice = targetPrice;
      comparisonLabel = `target $${targetPrice.toLocaleString()}`;
      if (yesAbove) {
        winnerSide = endPrice > comparisonPrice ? "YES" : "NO";
      } else if (yesBelow) {
        winnerSide = endPrice < comparisonPrice ? "YES" : "NO";
      } else {
        winnerSide = endPrice > comparisonPrice ? "YES" : "NO";
      }
      if (endPrice === comparisonPrice) {
        winnerSide = "NO";
      }
    } else {
      // Directional: "BTC higher than creation price" — compare current vs snapshot
      comparisonPrice = startPrice;
      comparisonLabel = `snapshot $${startPrice.toFixed(2)}`;
      const priceUp = endPrice > startPrice;
      const priceSame = endPrice === startPrice;
      if (yesAbove || (!yesBelow && !yesAbove)) {
        winnerSide = priceUp ? "YES" : "NO";
      } else {
        winnerSide = priceUp ? "NO" : "YES";
      }
      if (priceSame) {
        winnerSide = yesAbove || (!yesBelow && !yesAbove) ? "NO" : "YES";
      }
    }

    const startTs = new Date(bet.snapshotTimeUtc!).getTime();
    const endTs = new Date(current.snapshot_time_utc).getTime();
    const startKlineUrl = `https://api.binance.com/api/v3/klines?symbol=${bet.snapshotSymbol}&interval=1m&startTime=${startTs}&limit=1`;
    const endKlineUrl = `https://api.binance.com/api/v3/klines?symbol=${bet.snapshotSymbol}&interval=1m&startTime=${endTs}&limit=1`;

    const evidence: EvidenceItem[] = [
      {
        source_url: startKlineUrl,
        source_name: `${current.source} — historical 1m candle at creation`,
        published_or_observed_at: bet.snapshotTimeUtc,
        relevant_excerpt: `${bet.snapshotSymbol} = $${startPrice.toFixed(2)} at ${bet.snapshotTimeUtc} (stored at wager creation)`,
        supports: "NEUTRAL",
        explanation: `Snapshot price recorded by server at wager creation.`,
      },
      {
        source_url: endKlineUrl,
        source_name: `${current.source} — historical 1m candle at resolution`,
        published_or_observed_at: current.snapshot_time_utc,
        relevant_excerpt: `${bet.snapshotSymbol} = $${endPrice.toFixed(2)} at ${current.snapshot_time_utc} (fetched at resolution)`,
        supports: winnerSide === "YES" ? "YES" : "NO",
        explanation: isTargetPriceBet
          ? `Current $${endPrice.toFixed(2)} vs ${comparisonLabel}. ${winnerSide} wins.`
          : `Price $${startPrice.toFixed(2)} → $${endPrice.toFixed(2)} (${((endPrice - startPrice) / startPrice * 100).toFixed(2)}%). ${winnerSide} wins.`,
      },
    ];

    const reasoning = isTargetPriceBet
      ? `${bet.snapshotSymbol} at $${endPrice.toFixed(2)} vs ${comparisonLabel}. ${winnerSide} wins.`
      : `${bet.snapshotSymbol} price moved from $${startPrice.toFixed(2)} to $${endPrice.toFixed(2)} (${((endPrice - startPrice) / startPrice * 100).toFixed(2)}%). ${winnerSide} wins.`;

    console.log(
      `[resolver] Crypto result: ${isTargetPriceBet ? "target" : "directional"}, ` +
      `current=$${endPrice.toFixed(2)} vs ${comparisonLabel}, winner=${winnerSide}`
    );

    return {
      bet_id: bet.id,
      winner_side: winnerSide,
      confidence: 0.99,
      needs_manual_review: false,
      evidence,
      reasoning_summary: reasoning,
      failure_reason: null,
    };
  } catch (err) {
    console.error(`[resolver] Binance price fetch failed:`, err);
    return null;
  }
}

function buildSearchQueries(bet: BetForResolution): string[] {
  const queries: string[] = [];
  queries.push(bet.normalizedQuestion);
  if (bet.objectiveCriteria.length > 0) {
    queries.push(bet.objectiveCriteria.join(" ") + " result outcome");
  }
  if (bet.category === "sports") {
    queries.push(`${bet.normalizedQuestion} score final result`);
  } else if (bet.category === "politics") {
    queries.push(`${bet.normalizedQuestion} official announcement`);
  } else if (bet.category === "entertainment") {
    queries.push(`${bet.normalizedQuestion} winner announcement`);
  }
  return queries.slice(0, 3);
}

export async function resolveWager(bet: BetForResolution): Promise<ResolveResult> {
  const cryptoResult = await resolveCryptoPriceComparison(bet);
  if (cryptoResult) return cryptoResult;

  const { multiSearch } = await import("@/lib/web-search");
  const queries = buildSearchQueries(bet);
  console.log(`[resolver] Searching with ${queries.length} queries for bet ${bet.id}`);
  const webResults = await multiSearch(queries, 4);

  console.log(`[resolver] Web search returned ${webResults.length} results for bet ${bet.id}`);

  const searchContext = webResults.length > 0
    ? "\n\nWEB SEARCH RESULTS (use these as evidence):\n" +
      webResults.map((r, i) =>
        `[${i + 1}] ${r.title}\n    URL: ${r.url}\n    ${r.content.slice(0, 600)}${r.published_date ? `\n    Published: ${r.published_date}` : ""}`
      ).join("\n\n")
    : "\n\nNo web search results found. Return UNKNOWN with needs_manual_review: true.";

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

  const userMessage = `BET DATA:\n${betData}\n${searchContext}`;

  console.log(`[resolver] Starting AI resolution for bet ${bet.id}`);

  const resolveTool = {
    name: "submit_resolution" as const,
    description: "Submit the wager resolution verdict with evidence",
    input_schema: {
      type: "object" as const,
      properties: {
        winner_side: { type: "string" as const, enum: ["YES", "NO", "UNKNOWN"] },
        confidence: { type: "number" as const },
        needs_manual_review: { type: "boolean" as const },
        evidence: {
          type: "array" as const,
          items: {
            type: "object" as const,
            properties: {
              source_url: { type: "string" as const },
              source_name: { type: "string" as const },
              published_or_observed_at: { type: ["string", "null"] as const },
              relevant_excerpt: { type: "string" as const },
              supports: { type: "string" as const, enum: ["YES", "NO", "NEUTRAL"] },
              explanation: { type: "string" as const },
            },
            required: ["source_url", "source_name", "relevant_excerpt", "supports", "explanation"],
          },
        },
        reasoning_summary: { type: "string" as const },
        failure_reason: { type: ["string", "null"] as const },
      },
      required: ["winner_side", "confidence", "needs_manual_review", "evidence", "reasoning_summary"],
    },
  };

  const response = await client.messages.create({
    model: "claude-sonnet-4-6",
    max_tokens: 2048,
    system: buildSystemPrompt(),
    messages: [{ role: "user", content: userMessage }],
    tools: [resolveTool],
    tool_choice: { type: "tool", name: "submit_resolution" },
  });

  const toolBlock = response.content.find((c) => c.type === "tool_use");
  if (!toolBlock || toolBlock.type !== "tool_use") {
    console.error(`[resolver] AI did not return structured tool output`);
    return {
      bet_id: bet.id,
      winner_side: "UNKNOWN",
      confidence: 0,
      needs_manual_review: true,
      evidence: [],
      reasoning_summary: "AI did not return structured output",
      failure_reason: "No tool_use block in response",
    };
  }

  const validation = resolveResultSchema.safeParse({
    bet_id: bet.id,
    ...toolBlock.input as Record<string, unknown>,
  });
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
  const searchUrls = new Set(webResults.map((r) => r.url));

  // --- Post-hoc validation (zero-cost, no extra API calls) ---
  const flags: string[] = [];

  // 1. Low confidence
  if (result.confidence < 0.8) {
    flags.push(`low-confidence:${result.confidence}`);
  }

  // 2. Conflicting evidence
  const yesCount = result.evidence.filter((e) => e.supports === "YES").length;
  const noCount = result.evidence.filter((e) => e.supports === "NO").length;
  if (yesCount > 0 && noCount > 0) {
    flags.push(`conflicting-evidence:${yesCount}Y/${noCount}N`);
  }

  // 3. Missing source URL
  if (result.evidence.some((e) => !e.source_url || e.source_url.length === 0)) {
    flags.push("empty-source-url");
  }

  // 4. Hallucinated URLs — AI cited a URL not in search results
  const hallucinatedUrls = result.evidence.filter(
    (e) => e.source_url && !searchUrls.has(e.source_url) && webResults.length > 0
  );
  if (hallucinatedUrls.length > 0) {
    flags.push(`hallucinated-urls:${hallucinatedUrls.length}`);
  }

  // 5. Deadline not passed — AI should return UNKNOWN
  const deadlinePassed = new Date(bet.deadlineUtc).getTime() <= Date.now();
  if (!deadlinePassed && result.winner_side !== "UNKNOWN") {
    flags.push("verdict-before-deadline");
  }

  // 6. Winner-evidence mismatch — AI says YES but majority evidence says NO (or vice versa)
  if (result.winner_side !== "UNKNOWN" && result.evidence.length > 0) {
    const supportingCount = result.evidence.filter((e) => e.supports === result.winner_side).length;
    const opposingCount = result.evidence.filter(
      (e) => e.supports !== "NEUTRAL" && e.supports !== result.winner_side
    ).length;
    if (opposingCount > supportingCount) {
      flags.push(`winner-evidence-mismatch:${supportingCount}for/${opposingCount}against`);
    }
  }

  // 7. High confidence with no evidence
  if (result.confidence >= 0.8 && result.evidence.length === 0) {
    flags.push("high-confidence-no-evidence");
  }

  // 8. Duplicate evidence URLs with conflicting supports
  const urlSupports = new Map<string, Set<string>>();
  for (const e of result.evidence) {
    if (!e.source_url) continue;
    if (!urlSupports.has(e.source_url)) urlSupports.set(e.source_url, new Set());
    urlSupports.get(e.source_url)!.add(e.supports);
  }
  for (const [url, supports] of urlSupports) {
    if (supports.size > 1) {
      flags.push(`self-contradicting-url:${url.slice(0, 50)}`);
    }
  }

  // Apply flags
  if (flags.length > 0) {
    result.needs_manual_review = true;
    console.log(`[resolver] Validation flags for ${bet.id}: ${flags.join(", ")}`);
  }

  // Adversarial verification: only for non-deterministic markets in the 0.8–0.93 band
  const DETERMINISTIC_CATEGORIES = ["crypto", "sports"];
  const needsChallenge =
    result.winner_side !== "UNKNOWN" &&
    !result.needs_manual_review &&
    result.confidence >= 0.8 &&
    result.confidence <= 0.93 &&
    !DETERMINISTIC_CATEGORIES.includes(bet.category);

  if (needsChallenge) {
    console.log(`[resolver] Confidence ${result.confidence} in challenge band [0.8–0.93] — running adversarial verification`);
    const confidenceBefore = result.confidence;
    const challengeResult = await challengeResolution(bet, result, webResults);

    if (challengeResult.disagrees) {
      result.needs_manual_review = true;
      result.confidence = Math.min(result.confidence, 0.75);
      result.reasoning_summary += ` [CHALLENGED: ${challengeResult.reason}]`;
      console.log(`[resolver] Challenger DISAGREED for bet ${bet.id}: ${challengeResult.reason}`);
    } else {
      result.confidence = Math.min(result.confidence + 0.03, 0.95);
      console.log(`[resolver] Challenger CONFIRMED ${result.winner_side} for bet ${bet.id} — confidence bumped to ${result.confidence}`);
    }

    // Log challenge to DB
    try {
      const cr = challengeResult.response;
      await prisma.resolutionEvidence.create({
        data: {
          betId: bet.id,
          sourceUrl: `model:${CHALLENGER_MODEL}`,
          sourceName: "adversarial-challenger",
          relevantExcerpt: JSON.stringify({
            verdict_is_correct: cr?.verdict_is_correct,
            wording_ambiguity: cr?.wording_ambiguity_detected,
            edge_cases: cr?.exploitable_edge_cases,
            evidence_gaps: cr?.evidence_gaps,
            confidence_in_original: cr?.confidence_in_original,
            recommended_action: cr?.recommended_action,
            confidence_before: confidenceBefore,
            confidence_after: result.confidence,
            challenger_disagreed: challengeResult.disagrees,
          }),
          supports: challengeResult.disagrees ? "NO" : "YES",
          explanation: challengeResult.disagrees
            ? `CHALLENGED: ${challengeResult.reason}`
            : `Confirmed verdict ${result.winner_side} — no exploitable flaws found. Counter-argument: ${cr?.counter_argument || "none"}`,
        },
      });
    } catch (logErr) {
      console.error(`[resolver] Failed to log challenge result:`, logErr);
    }
  }

  console.log(`[resolver] Bet ${bet.id}: winner=${result.winner_side}, confidence=${result.confidence}, review=${result.needs_manual_review}`);

  return result;
}

// --- Adversarial Challenger ---

const CHALLENGER_MODEL = "claude-haiku-4-5-20251001";

const challengeResponseSchema = z.object({
  verdict_is_correct: z.boolean(),
  wording_ambiguity_detected: z.boolean().default(false),
  exploitable_edge_cases: z.array(z.string()).default([]),
  evidence_gaps: z.array(z.string()).default([]),
  counter_argument: z.string().default(""),
  confidence_in_original: z.number().min(0).max(1).default(0.5),
  recommended_action: z.enum(["CONFIRM", "FLAG_FOR_REVIEW", "REJECT"]).default("FLAG_FOR_REVIEW"),
});

type ChallengeResponse = z.infer<typeof challengeResponseSchema>;

function buildChallengerSystemPrompt(): string {
  const now = new Date().toISOString();
  return `You are a hostile adversarial auditor for a P2P wager resolution system. CURRENT_DATE_UTC: ${now}

Your ONLY purpose is to find flaws, ambiguities, and exploits in another AI's resolution verdict. You are the last defense before real money is paid out on-chain. If you miss a flaw, someone loses funds unfairly.

You must aggressively check for:

1. WORDING EXPLOITS: Can the YES/NO definitions be interpreted differently than the resolver assumed? Look for:
   - Temporal ambiguity ("by Friday" — start of day? End of day? Which timezone?)
   - Scope ambiguity ("price above X" — spot? futures? which exchange? bid/ask/last?)
   - Negation traps ("will NOT exceed" — double negatives, implicit conditions)
   - Vague qualifiers ("significantly", "roughly", "around", "most likely")
   - Missing precision ("higher" — by how much? Any amount counts?)

2. EVIDENCE QUALITY: For each piece of evidence the resolver used:
   - Is the source authoritative for this claim?
   - Does the excerpt actually support the claimed side, or is it taken out of context?
   - Is the publication date BEFORE the deadline? (post-deadline sources may not reflect deadline-time state)
   - Are there plausible alternative interpretations of the same data?

3. TIMELINE ATTACKS: Has the deadline actually passed? Could the event still change? Is there a gap between "deadline" and "when outcome became known"?

4. SEMANTIC ATTACKS: Could a malicious bettor argue the opposite interpretation of the same evidence? Think like a lawyer for the losing side.

You must respond with ONLY valid JSON matching this schema:
{
  "verdict_is_correct": boolean,
  "wording_ambiguity_detected": boolean,
  "exploitable_edge_cases": ["string"],
  "evidence_gaps": ["string"],
  "counter_argument": "string — your strongest case AGAINST the verdict",
  "confidence_in_original": 0-1,
  "recommended_action": "CONFIRM" | "FLAG_FOR_REVIEW" | "REJECT"
}

Rules:
- CONFIRM only if you genuinely cannot find a meaningful flaw after trying hard
- FLAG_FOR_REVIEW if you find ambiguity or weak evidence even if the verdict might be correct
- REJECT only if the verdict is clearly wrong based on the evidence
- Set wording_ambiguity_detected = true if YES/NO definitions have any exploitable interpretation gap
- List every edge case you find, even minor ones — let the threshold logic decide what matters`;
}

interface ChallengeResult {
  disagrees: boolean;
  reason: string;
  response: ChallengeResponse | null;
}

async function challengeResolution(
  bet: BetForResolution,
  initialResult: ResolveResult,
  rawWebResults: import("@/lib/web-search").SearchResult[],
): Promise<ChallengeResult> {
  try {
    const rawEvidence = rawWebResults.map((r, i) =>
      `[${i + 1}] ${r.title}\n    URL: ${r.url}\n    Published: ${r.published_date || "unknown"}\n    Content: ${r.content.slice(0, 800)}`
    ).join("\n\n");

    const resolverEvidence = initialResult.evidence.map((e, i) =>
      `[E${i + 1}] ${e.source_name} (supports: ${e.supports})\n    URL: ${e.source_url}\n    Excerpt: ${e.relevant_excerpt}\n    Explanation: ${e.explanation}`
    ).join("\n\n");

    const response = await client.messages.create({
      model: CHALLENGER_MODEL,
      max_tokens: 1536,
      system: buildChallengerSystemPrompt(),
      messages: [{
        role: "user",
        content: `=== WAGER CONTRACT ===
Question: ${bet.normalizedQuestion}
YES definition: ${bet.yesDefinition}
NO definition: ${bet.noDefinition}
Deadline: ${bet.deadlineUtc}
Category: ${bet.category}
Resolution sources: ${bet.resolutionSources.join(", ")}
Objective criteria: ${bet.objectiveCriteria.join(", ")}

=== INITIAL RESOLVER VERDICT ===
Winner: ${initialResult.winner_side}
Confidence: ${initialResult.confidence}
Reasoning: ${initialResult.reasoning_summary}

=== RESOLVER'S CITED EVIDENCE ===
${resolverEvidence || "No evidence cited."}

=== RAW WEB SEARCH RESULTS (unfiltered) ===
${rawEvidence || "No web search results available."}

Find every flaw. Respond with JSON only.`,
      }],
    });

    const content = response.content[0];
    if (content.type !== "text") {
      return { disagrees: false, reason: "", response: null };
    }

    let parsed: unknown;
    try {
      parsed = JSON.parse(content.text);
    } catch {
      console.error(`[challenger] Failed to parse response as JSON`);
      return { disagrees: false, reason: "Parse failure", response: null };
    }

    const validation = challengeResponseSchema.safeParse(parsed);
    if (!validation.success) {
      console.error(`[challenger] Schema validation failed:`, validation.error.issues);
      return { disagrees: false, reason: "Schema validation failed", response: null };
    }

    const challenge = validation.data;

    console.log(
      `[challenger] Bet ${bet.id}: correct=${challenge.verdict_is_correct}, ` +
      `ambiguity=${challenge.wording_ambiguity_detected}, ` +
      `edges=${challenge.exploitable_edge_cases.length}, ` +
      `gaps=${challenge.evidence_gaps.length}, ` +
      `conf=${challenge.confidence_in_original}, ` +
      `action=${challenge.recommended_action}`
    );

    // Threshold logic: disagree only on strong signal
    const disagrees =
      challenge.recommended_action === "REJECT" ||
      (challenge.recommended_action === "FLAG_FOR_REVIEW" && challenge.confidence_in_original < 0.65) ||
      (challenge.wording_ambiguity_detected && challenge.exploitable_edge_cases.length >= 2) ||
      (!challenge.verdict_is_correct && challenge.confidence_in_original < 0.6);

    const reason = disagrees
      ? [
          challenge.counter_argument,
          challenge.wording_ambiguity_detected ? "Wording ambiguity detected" : "",
          ...challenge.exploitable_edge_cases.slice(0, 2),
          ...challenge.evidence_gaps.slice(0, 2),
        ].filter(Boolean).join("; ")
      : "";

    return { disagrees, reason, response: challenge };
  } catch (err) {
    console.error(`[challenger] Error:`, err);
    return { disagrees: false, reason: "", response: null };
  }
}
