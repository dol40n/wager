# Wager — AI-Powered P2P Bet Escrow on Solana

## What This Project Is

Universal AI-powered peer-to-peer wager escrow on Solana devnet. Users create bets in natural language, AI normalizes into YES/NO conditions, funds go into PDA escrow, taker accepts via Blink/wallet, AI resolver determines outcome, 24h dispute window, then payout.

**Live**: https://wager-smoky.vercel.app
**Program**: `7fQ9Dh4iNrp2mfjtBthqrmrcYZXhSaCVZcyXVuCs6hFN` (Solana devnet)
**Status**: Private beta (devnet only, not mainnet-ready)

## Tech Stack

- Next.js 16 + TypeScript + Tailwind + shadcn/ui
- Solana Anchor program (Rust) with 9 instructions
- Prisma + PostgreSQL (Neon hosted)
- Anthropic Claude for AI normalize + resolve
- Tavily for web search evidence
- Binance/CoinGecko for crypto price snapshots
- Solana wallet adapter (Phantom/Solflare)
- Vercel hosting with daily cron

## Key Architecture

```
Frontend (Next.js) → API Routes → Prisma/PostgreSQL
                                → Anthropic AI (normalize + resolve)
                                → Tavily web search (evidence)
                                → Binance/CoinGecko (price snapshots)
                                → Solana devnet (PDA escrow)
                                → Solana Actions/Blinks
```

## On-Chain Program (Anchor 0.30.1)

9 instructions: initialize_bet, fund_maker, accept_bet, cancel_unaccepted_bet,
propose_result, dispute_result, finalize_result_after_dispute_window,
admin_finalize_disputed, refund_if_expired_or_unresolved

PDA escrow, 1% fee, 24h dispute window, 10 SOL max stake.

## Resolution Pipeline

1. Crypto + price snapshot → Binance/CoinGecko price comparison (99% confidence)
2. Any topic + Tavily key → web search → Claude AI analysis
3. Fallback → Claude from training data (low confidence → manual review)

## Critical Safety Rules

- DB-only finalize/refund is DISABLED (HTTP 410). All settlement goes through `/api/admin/bets/:id/finalize-onchain`
- Resolver authority keypair signs on-chain transactions from Vercel backend
- should_reject=true blocks bet creation (past deadlines, ambiguity > 0.25, missing reference prices)
- Admin actions require typed confirmation ("FINALIZE" / "REFUND")
- Evidence hashes use canonicalized JSON (sorted by source_url)

## Build & Test

```bash
npm run typecheck    # 0 errors
npm test             # 162 tests (vitest)
npm run build        # 22 routes
npm run generate:idl # IDL from source (anchor build IDL is broken)

# Anchor (requires Solana toolchain)
bash scripts/pin-deps.sh
cargo-build-sbf --manifest-path programs/wager_escrow/Cargo.toml --sbf-out-dir target/deploy
anchor test --skip-build  # 21 on-chain tests
```

## Env Vars (Vercel)

DATABASE_URL, ANTHROPIC_API_KEY, WAGER_PROGRAM_ID, ADMIN_API_KEY,
FEE_WALLET, RESOLVER_AUTHORITY_PRIVATE_KEY, TAVILY_API_KEY,
CRON_SECRET, NEXT_PUBLIC_SOLANA_RPC_URL, NEXT_PUBLIC_APP_URL

## Key Docs

- TOOLCHAIN.md — why deterministic IDL, edition2024 workaround
- HOSTED_BETA_REPORT.md — devnet tx signatures, settlement proof
- SECURITY_REVIEW.md — threat model, mainnet blockers
- PRIVATE_BETA.md — tester instructions
- DEMO_SCRIPT.md — step-by-step demo

## Rules

- Do what has been asked; nothing more, nothing less
- NEVER create files unless absolutely necessary — prefer editing existing files
- ALWAYS read a file before editing it
- NEVER commit secrets, credentials, or .env files
- Keep files under 500 lines
- Do not change on-chain settlement logic without explicit request
- Do not claim mainnet readiness — this is devnet only
