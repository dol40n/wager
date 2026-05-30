# Wager — AI-Powered P2P Bet Escrow on Solana

## What This Project Is

Universal AI-powered peer-to-peer wager escrow on Solana devnet. Users create bets in natural language, AI normalizes into YES/NO conditions, funds go into PDA escrow, taker accepts via Blink/wallet, AI resolver determines outcome, auto-finalize settles on-chain payout.

**Live**: https://wager-smoky.vercel.app
**Program**: `7fQ9Dh4iNrp2mfjtBthqrmrcYZXhSaCVZcyXVuCs6hFN` (Solana devnet)
**Resolver**: `2K8jv4HT8Er7fSTEtJ3yAzqUJoQ6eLiRPYxYW9KTmECa`
**Status**: Private beta (devnet only, not mainnet-ready)

## Tech Stack

- Next.js 16 + TypeScript + Tailwind + shadcn/ui
- Solana Anchor program (Rust) with 9 instructions
- Prisma + PostgreSQL (Neon hosted)
- Anthropic Claude (Sonnet for resolve, Haiku for adversarial verification)
- Tavily for web search evidence (advanced depth, multi-query)
- Binance/CoinGecko for crypto price snapshots
- Solana wallet adapter (Phantom/Solflare)
- Vercel hosting with 4 automated crons

## Key Architecture

```
Frontend (Next.js) → API Routes → Prisma/PostgreSQL
                                → Anthropic AI (normalize + resolve + challenger)
                                → Tavily web search (evidence)
                                → Binance/CoinGecko (price snapshots)
                                → Solana devnet (PDA escrow)
                                → Solana Actions/Blinks
```

## On-Chain Program (Anchor 0.30.1)

9 instructions: initialize_bet, fund_maker, accept_bet, cancel_unaccepted_bet,
propose_result, dispute_result, finalize_result_after_dispute_window,
admin_finalize_disputed, refund_if_expired_or_unresolved

- PDA escrow, tiered fees (0.5%–3%), 24h dispute window, 10 SOL max stake
- dispute_result accepts maker, taker, OR resolver_authority as disputer
- Admin finalize flow: propose → auto-dispute (resolver) → admin_finalize (instant)
- Shared settleOnChain() is the single source of truth for all on-chain transitions
- Idempotent: re-reads on-chain status between each TX step, safe to retry

## Fee Structure

```
Crypto:      < 5 SOL → 1%,  ≥ 5 SOL → 0.75%
Non-crypto:  < 0.25 SOL → 3%,  0.25–0.99 → 2%,  1–4.99 → 1%,  ≥ 5 → 0.75%
VIP:         0.5% flat (all categories, all stakes)

Non-crypto USD floor: $0.20 minimum fee
If floor would require > 5% → reject stake with min stake message
Fee calculated server-side, client fee_bps ignored
```

VIP auto-promotion: 10+ finalized bets OR 50+ SOL volume (weekly cron).
Manual VIP via VipWallet table (reason: "manual").

## Resolution Pipeline

```
deterministic (crypto/sports API) → direct finalize (0.99 confidence)
non-deterministic → AI resolve (Sonnet) → confidence check:
  < 0.8       → manual review
  0.8–0.93    → adversarial challenge (Haiku) → disagrees → manual review
                                               → agrees   → proceed
  > 0.93      → proceed (skip challenger)
after dispute window → auto-finalize cron
```

- Crypto: target-price ("above $110k") vs directional ("higher than at creation")
- Web search: multi-query Tavily (advanced depth), 600 chars/result
- Challenger uses different model family (Haiku vs Sonnet) to reduce correlated failures
- Challenger sees raw evidence + market wording, not just resolver summary
- Checks: wording ambiguity, exploitable edge cases, evidence gaps, timeline attacks
- Challenge results logged to ResolutionEvidence (sourceName: "adversarial-challenger")
- Resolver retry: max 3 attempts, tracks resolveAttempts + lastResolveError per bet

Price snapshots are saved at bet creation (CoinGecko, Binance as primary with CoinGecko fallback since Binance blocks US datacenter IPs).

## Admin Finalize Flow (Critical)

```
settleOnChain() handles ALL on-chain states (idempotent):
  ACCEPTED → propose_result → refresh → dispute_result → refresh → admin_finalize
  RESULT_PROPOSED → dispute_result → refresh → admin_finalize
  DISPUTED → admin_finalize
  FINALIZED → no-op (returns success)
```

- DB-only finalize/refund is DISABLED (HTTP 410)
- DB status FINALIZED only AFTER on-chain vault verified empty
- Resolver authority signs all on-chain TX from Vercel backend
- Admin action logs stored with before/after status, evidence hash, payout
- settleOnChain() used by both admin finalize and auto-finalize cron

## Normalize Safety Rules

- CURRENT_DATE_UTC and CURRENT_YEAR injected into every AI prompt
- Past deadlines rejected server-side (deadline <= now + 1min)
- Ambiguity > 0.25 → should_reject = true (blocks creation)
- "higher/выше" without $ target → rejected ("higher than what?")
- "approximately/примерно" → rejected (needs explicit tolerance)
- AI cannot invent current prices — requires backend snapshot
- Rejected wagers show ONLY rejection reason, never YES/NO definitions

## Key API Routes

```
POST /api/bets/normalize              — AI normalize (rate limited)
POST /api/bets/create                 — Create bet + price snapshot + fee calculation (rate limited)
POST /api/bets/:id/fund-maker/tx      — Build init+fund TX (auto-detects if PDA needs init)
POST /api/bets/:id/sync               — Sync DB from on-chain state (public for read, admin for override)
POST /api/bets/:id/dispute            — File dispute
GET  /api/actions/bet/:id              — Blink GET (redirects browsers to /bet/:id)
POST /api/actions/bet/:id/accept       — Blink POST accept TX
POST /api/admin/bets/:id/finalize-onchain — Full on-chain settlement (uses settleOnChain)
POST /api/admin/bets/:id/refund-onchain   — DB refund (on-chain needs 7-day timeout)
POST /api/resolver/run/:id             — Run resolver on specific bet (admin only)
GET  /api/resolver/evidence/:id        — Get resolution evidence for bet
GET  /api/health                       — DB + RPC + resolver key check
```

## Cron Jobs

```
GET /api/cron/resolve     — Daily 00:00 UTC — AI resolve bets past deadline (3 retries)
GET /api/cron/finalize    — Daily 01:00 UTC — Auto-finalize undisputed bets past dispute window
GET /api/cron/cleanup     — Daily 02:00 UTC — Purge expired rate limit entries
GET /api/cron/vip-check   — Weekly Sun 03:00 UTC — Auto-promote VIP by volume
```

All crons accept both `Authorization: Bearer CRON_SECRET` and `x-admin-api-key` header.

## Build & Test

```bash
npm run typecheck    # 0 errors
npm test             # 289 tests (vitest, incl. bankrun on-chain refund test)
npm run build        # ~26 routes
npm run generate:idl # IDL from source (anchor build IDL is broken)

# Anchor (requires Solana toolchain — see TOOLCHAIN.md)
bash scripts/pin-deps.sh
cargo-build-sbf --manifest-path programs/wager_escrow/Cargo.toml --sbf-out-dir target/deploy
anchor test --skip-build  # 21 on-chain tests

# Deploy program to devnet
solana program deploy target/deploy/wager_escrow.so --program-id target/deploy/wager_escrow-keypair.json --url devnet

# Deploy app to Vercel (auto-runs prisma db push + generate + build)
vercel deploy --prod --yes
```

## Env Vars (Vercel)

DATABASE_URL, ANTHROPIC_API_KEY, WAGER_PROGRAM_ID, ADMIN_API_KEY,
FEE_WALLET, RESOLVER_AUTHORITY_PRIVATE_KEY, TAVILY_API_KEY,
CRON_SECRET, NEXT_PUBLIC_SOLANA_RPC_URL, NEXT_PUBLIC_APP_URL,
NEXT_PUBLIC_BUG_REPORT_URL

## Key Docs

- TOOLCHAIN.md — why deterministic IDL, edition2024 workaround
- HOSTED_BETA_REPORT.md — devnet tx signatures, settlement proof
- SECURITY_REVIEW.md — threat model, mainnet blockers
- PRIVATE_BETA.md — tester instructions
- DEMO_SCRIPT.md — step-by-step demo
- BETA_KNOWN_LIMITATIONS.md — known limitations

## Known Issues

- utils.ts: hashEvidence uses lazy require('crypto') — don't move to top-level import (breaks client components)
- Binance API blocked from Vercel US IPs — CoinGecko used as fallback for price snapshots
- Anchor 0.30.1 IDL generation broken — use npm run generate:idl
- dry_run on resolver/run endpoint disabled in production (NODE_ENV check)

## Rules

- Do what has been asked; nothing more, nothing less
- NEVER create files unless absolutely necessary — prefer editing existing files
- ALWAYS read a file before editing it
- NEVER commit secrets, credentials, or .env files
- Keep files under 500 lines
- After fixing bugs: typecheck → deploy to Vercel → verify on hosted URL
- Do not claim mainnet readiness — this is devnet only
