export interface NormalizeResult {
  original_text: string;
  normalized_question: string;
  category: "crypto" | "sports" | "social_media" | "news" | "custom";
  yes_definition: string;
  no_definition: string;
  deadline_utc: string;
  resolution_sources: string[];
  resolution_method: "api" | "web_research" | "ai_evidence" | "manual_review";
  objective_criteria: string[];
  ambiguity_score: number;
  ambiguity_notes: string[];
  should_reject: boolean;
  rejection_reason: string | null;
  resolution_plan: string | null;
  suggestions: string[];
}

export interface EvidenceItem {
  source_url: string;
  source_name: string;
  published_or_observed_at: string | null;
  relevant_excerpt: string;
  supports: "YES" | "NO" | "NEUTRAL";
  explanation: string;
}

export interface ResolveResult {
  bet_id: string;
  winner_side: "YES" | "NO" | "UNKNOWN";
  confidence: number;
  needs_manual_review: boolean;
  evidence: EvidenceItem[];
  reasoning_summary: string;
  failure_reason: string | null;
}

export type BetStatusType =
  | "OPEN"
  | "ACCEPTED"
  | "RESULT_PROPOSED"
  | "DISPUTED"
  | "FINALIZED"
  | "CANCELLED"
  | "REFUNDED";

export type BetSideType = "YES" | "NO";

export interface BetDisplay {
  id: string;
  onChainAddress: string | null;
  normalizedQuestion: string;
  category: string;
  yesDefinition: string;
  noDefinition: string;
  deadlineUtc: string;
  makerSide: BetSideType;
  stakeLamports: string;
  status: BetStatusType;
  makerPubkey: string;
  takerPubkey: string | null;
  proposedWinner: BetSideType | null;
  finalWinner: BetSideType | null;
  disputeDeadlineUtc: string | null;
  resolverConfidence: number | null;
  needsManualReview: boolean;
  createdAt: string;
}
