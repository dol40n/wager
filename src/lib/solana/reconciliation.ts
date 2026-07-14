const CHAIN_STATUSES = [
  "OPEN",
  "ACCEPTED",
  "RESULT_PROPOSED",
  "DISPUTED",
  "FINALIZED",
] as const;

const TERMINAL_CHAIN_STATUSES = new Set(["FINALIZED", "CANCELLED", "REFUNDED"]);

/**
 * The application records resolution and disputes before publishing those
 * transitions on-chain. Reconciliation may correct early DB state in either
 * direction and adopt terminal chain truth, but must never overwrite newer
 * application workflow state with a deliberately lagging program status.
 */
export function shouldAdoptChainStatus(
  dbStatus: string,
  chainStatus: string
): boolean {
  if (dbStatus === chainStatus) return false;
  if (TERMINAL_CHAIN_STATUSES.has(chainStatus)) return true;

  if (!CHAIN_STATUSES.includes(chainStatus as (typeof CHAIN_STATUSES)[number])) {
    return false;
  }

  // These two states intentionally exist in PostgreSQL before their equivalent
  // transition is submitted on-chain. Preserve them while the chain is still
  // Open/Accepted/ResultProposed, but allow terminal chain truth above.
  if (dbStatus === "RESULT_PROPOSED" || dbStatus === "DISPUTED") {
    return dbStatus === "RESULT_PROPOSED" && chainStatus === "DISPUTED";
  }

  // For early workflow states, the chain is authoritative in either direction.
  // This lets an explicit sync correct an incorrectly advanced ACCEPTED row.
  return dbStatus === "OPEN" || dbStatus === "ACCEPTED";
}
