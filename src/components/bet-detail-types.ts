export interface BetDetailData {
  id: string;
  onChainAddress: string | null;
  normalizedQuestion: string;
  originalText: string;
  category: string;
  yesDefinition: string;
  noDefinition: string;
  deadlineUtc: string;
  makerSide: string;
  stakeLamports: string;
  feeBps: number;
  status: string;
  makerFunded: boolean;
  maker: { pubkey: string };
  taker: { pubkey: string } | null;
  proposedWinner: string | null;
  finalWinner: string | null;
  disputeDeadlineUtc: string | null;
  resolverConfidence: number | null;
  needsManualReview: boolean;
  evidenceHash: string | null;
  evidence: Array<{
    id: string;
    sourceUrl: string;
    sourceName: string;
    relevantExcerpt: string;
    supports: string;
    explanation: string;
  }>;
  disputes: Array<{
    id: string;
    reason: string;
    createdAt: string;
  }>;
  resolutionSources: string[];
  objectiveCriteria: string[];
}

export const TERMINAL_STATUSES = ["FINALIZED", "CANCELLED", "REFUNDED"];
