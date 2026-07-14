# Known Limitations

Wager is an experimental Solana devnet project. It is not mainnet-ready, has not
been independently audited and must not be used with real funds.

## Deployment status

- There is no active hosted demo. The former Vercel deployment returned
  `DEPLOYMENT_NOT_FOUND` when checked on 2026-07-14.
- The Anchor program remains visible on Solana devnet, but a deployed executable
  account is not proof that the current source and deployed binary match.

## Centralized authority

- A single backend-controlled resolver key can propose results, dispute them
  and finalize disputed wagers.
- Admin routes use one shared API secret. There are no per-user admin accounts,
  sessions or MFA.
- The application-level dispute process ultimately depends on the database,
  cron execution and the resolver authority.
- The dispute API trusts a submitted participant public key and does not verify
  wallet ownership with a signed nonce or transaction.

## Dispute and settlement model

- Resolution first writes the proposal, evidence hash and 24-hour deadline to
  PostgreSQL. It does not publish the result on-chain at that point.
- During finalization, `settleOnChain()` publishes the result, uses the resolver
  authority to dispute it and then calls the privileged finalize instruction.
  The application window is therefore not the Anchor program's natural on-chain
  dispute window.
- The retry-aware finalization path prevents duplicate payout through program
  status checks, but it does not provide a general API idempotency key or a full
  exactly-once guarantee.
- An already-finalized retry does not independently compare the requested
  winner with the final winner stored on-chain or recheck that the vault is
  empty before updating PostgreSQL.
- A retry that begins from on-chain `ResultProposed` always attempts to dispute.
  If the on-chain dispute deadline has elapsed, the current settlement helper
  does not fall back to the natural permissionless finalize instruction.

## Refund behavior

- `POST /api/admin/bets/:id/refund-onchain` does not currently submit the
  Anchor refund instruction. It marks PostgreSQL `REFUNDED` and reports whether
  the vault still contains funds.
- A funded vault must still be cancelled by the maker when eligible or refunded
  on-chain after the program's seven-day timeout.
- The database route accepts `RESULT_PROPOSED`, but the Anchor refund instruction
  accepts only `Open`, `Accepted` or `Disputed`. If the proposal is already
  on-chain, marking the database row refunded does not leave a direct refund
  transition for the vault.
- The route checks vault balance but not the on-chain account status. A stale
  database row can therefore be relabeled `REFUNDED` even when the chain account
  is already finalized, and terminal-row reconciliation will not repair it.
- The route name and the HTTP 410 message from the legacy refund endpoint can
  give a stronger atomicity impression than the implementation provides.

## On-chain invariants to harden

- `fund_maker` can be called repeatedly while a wager is `Open`, and
  `accept_bet` does not require the vault to contain exactly one prior maker
  stake. The application normally sequences and observes maker funding, but a
  directly constructed transaction can create an unfunded or overfunded pot.
- Finalize instructions accept a writable fee-wallet account without constraining
  it to a platform address stored in program state. The backend passes its
  configured wallet, but the program does not enforce that destination.
- Initialization stores the resolver authority supplied by the transaction and
  only caps the submitted fee at 5%. Because the maker signs an unsigned
  transaction built by the backend, a maliciously reconstructed transaction is
  not guaranteed to preserve backend configuration.
- The sync and accept paths do not compare every on-chain initialization field
  with the PostgreSQL record.

These are explicit blockers for any real-funds deployment.

## Database and chain consistency

- Synchronization is polling-based; there is no program event subscription or
  webhook consumer.
- The scheduled reconcile job scans only database rows in non-terminal states.
  It does not repair an incorrectly terminal row.
- Reconciliation does not recover transaction signatures or independently
  derive the final winner from the account; it can reuse the database proposal.
- A chain transaction can succeed before a follow-up database write. The retry
  and reconcile paths reduce, but do not eliminate, this consistency window.

## Validation and rate limiting

- Zod validates normalization, creation, dispute and admin-finalize payloads,
  plus AI output. Fund, accept, sync, refund and list inputs use narrower manual
  checks instead of a consistent schema boundary.
- Content and ambiguity guards run in the normalization route. The create route
  accepts client-supplied normalized fields and does not repeat every guard.
- The atomic PostgreSQL fixed-window limiter protects create and normalize only.
  It deliberately fails open during a database outage.
- A fixed-window boundary can permit a short burst above the nominal rate.

## Resolution data

- Deterministic API resolution is implemented for supported crypto symbols;
  sports and general events use Tavily evidence plus Anthropic.
- The crypto resolver reads a current ticker when resolution runs. It does not
  fetch and verify a historical price exactly at the deadline.
- Generated Binance kline URLs are evidence references; the implementation does
  not fetch the kline payload before recording them.
- Evidence pages can change or disappear. Solana stores a hash commitment, not
  the evidence content or an oracle attestation.
- Model output can be wrong or manipulated. Confidence thresholds and a second
  model call are application checks, not correctness guarantees.

## Operations and data model

- Vercel schedules five polling jobs; there is no queue, dead-letter workflow or
  dedicated observability pipeline in this repository.
- Prisma migrations are not committed. Local and Vercel setup currently use
  `prisma db push`, which is unsuitable as a mature production migration story.
- The admin credential historically appeared in tracked test scripts. It must
  be rotated independently of removing those files; see `SECURITY_REVIEW.md`.
- GitHub secret scanning, push protection and Dependabot security updates should
  be enabled in repository settings.
- The 2026-07-14 dependency audit reports no high/critical production
  vulnerabilities, but reports 19 moderate production findings and 27 total
  findings (including 3 high-severity development-tool findings). Available
  automated fixes require dependency changes that need separate compatibility
  review.

## Product and legal scope

- The program is devnet-only and unaudited.
- There is no identity, jurisdiction or age verification.
- No legal or regulatory review of the wager mechanism is documented.
- There are no user notifications and no guaranteed SLA or recovery process.

## Mainnet blockers

At minimum:

1. rotate every exposed credential and complete a coordinated history-cleaning
   decision;
2. obtain an independent Anchor security audit and add fuzz/property tests;
3. enforce funding, resolver, fee destination and initialization invariants
   on-chain;
4. replace the single resolver/admin authority with a reviewed multi-party or
   oracle design;
5. require signed dispute authorization and align the user dispute window with
   an enforceable on-chain flow;
6. implement a real on-chain refund orchestration path;
7. add event-driven, terminal-state-aware reconciliation;
8. validate every externally controlled payload consistently;
9. add production migrations, monitoring and incident response;
10. complete legal and regulatory review.
