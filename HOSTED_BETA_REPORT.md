# Hosted Beta Report

## Status: LIVE — AI ENABLED

The wager escrow devnet beta is deployed, publicly accessible, and AI-powered.

## URLs

| Resource | URL |
|----------|-----|
| **App** | https://wager-smoky.vercel.app |
| **Healthcheck** | https://wager-smoky.vercel.app/api/health |
| **Program (Explorer)** | https://explorer.solana.com/address/7fQ9Dh4iNrp2mfjtBthqrmrcYZXhSaCVZcyXVuCs6hFN?cluster=devnet |
| **Test Bet** | https://wager-smoky.vercel.app/bet/cmpm55gsa00026m2w480r53wq |

## Healthcheck

```json
{
  "status": "healthy",
  "program_id": "7fQ9Dh4iNrp2mfjtBthqrmrcYZXhSaCVZcyXVuCs6hFN",
  "checks": {
    "database": { "ok": true, "latencyMs": 1309 },
    "solana_rpc": { "ok": true, "latencyMs": 65 }
  },
  "timestamp": "2026-05-26T04:30:49.086Z"
}
```

## Configuration

| Env Var | Status |
|---------|--------|
| `DATABASE_URL` | Set (Neon PostgreSQL) |
| `ANTHROPIC_API_KEY` | Set |
| `WAGER_PROGRAM_ID` | Set |
| `ADMIN_API_KEY` | Set |
| `FEE_WALLET` | Set |
| `NEXT_PUBLIC_SOLANA_RPC_URL` | Set (devnet) |
| `NEXT_PUBLIC_SOLANA_NETWORK` | Set (devnet) |
| `NEXT_PUBLIC_APP_URL` | Set |
| `RESOLVER_AUTHORITY_PRIVATE_KEY` | NOT SET — on-chain resolution requires this |

## AI Normalize Smoke Test

**Input**: "Will Bitcoin be above $100,000 by 2026-06-01 18:00 UTC?"

**Output** (all fields match NormalizeResult schema via Zod validation):
- `normalized_question`: "Will Bitcoin (BTC) price be above $100,000 USD by 2026-06-01 18:00 UTC?"
- `category`: "crypto"
- `yes_definition`: "BTC price > $100,000.00 at deadline per CoinGecko"
- `no_definition`: "BTC price <= $100,000.00 at deadline per CoinGecko"
- `deadline_utc`: "2026-06-01T18:00:00Z"
- `resolution_sources`: CoinGecko, CoinMarketCap, Binance APIs
- `ambiguity_score`: 0
- `should_reject`: false

## Test Bet Created

| Field | Value |
|-------|-------|
| ID | `cmpm55gsa00026m2w480r53wq` |
| Question | Will Bitcoin (BTC) price be above $100,000 USD by 2026-06-01 18:00 UTC? |
| Status | OPEN |
| Maker | `CjnFMbXwmFnqUeqfWzTYNa2vndGkaMnMQbTM98UqxQux` |
| Stake | 0.05 SOL |
| On-chain PDA | `BXDfCCTpEtZMHGzfx5dWQjnkQPgH4KqNm3PThBw7r925` |

## Blink Action State

- **Status**: "Awaiting maker funding" (disabled) — correct, bet not yet funded on-chain
- All metadata (question, YES/NO defs, stake, deadline) renders correctly

## Resolver Safety Checks

| Test | Result |
|------|--------|
| Resolver on non-ACCEPTED bet | Rejected: "Bet is not in ACCEPTED status" |
| Batch resolver with no eligible bets | `{ processed: 0, results: [] }` |
| Resolver requires admin API key | Enforced (401 without key) |

## Infrastructure

| Component | Provider | Details |
|-----------|----------|---------|
| Frontend/API | Vercel | Next.js 16, iad1 region |
| Database | Neon | PostgreSQL 17, us-east-2, all 6 tables |
| Blockchain | Solana devnet | Program `7fQ9Dh...6hFN` |
| AI | Anthropic | Claude Sonnet 4 (normalize + resolve) |

## Full Hosted Flow (manual browser steps)

To complete the full lifecycle through the hosted UI:

1. Open https://wager-smoky.vercel.app/create
2. Enter a wager description, click "Analyze Wager"
3. Review AI-normalized conditions, click "Confirm & Create Bet"
4. On the bet detail page, use Phantom/Solflare (devnet) to sign `initialize_bet` + `fund_maker` transactions
5. Copy the Blink URL and share with counterparty
6. Taker opens Blink, connects devnet wallet, signs `accept_bet`
7. After deadline, admin runs resolver at `/admin` panel
8. 24h dispute window or admin finalize

## What's Enabled

- AI wager normalization (Anthropic Claude)
- AI resolver (Anthropic Claude) — proposes winners with evidence
- Zod validation on all AI responses
- Content safety blocklist
- Rate limiting (5 creates/min, 10 normalizes/min)
- Admin action logging to DB
- Healthcheck monitoring

## What Still Needs Manual Setup

- `RESOLVER_AUTHORITY_PRIVATE_KEY`: Required for the backend to sign `propose_result` and `admin_finalize_disputed` transactions on-chain. Without this, resolution is DB-only (no on-chain state change).
- Wallet adapter integration for seamless browser signing.

## Known Issues

1. In-memory rate limiter resets on Vercel cold starts
2. No real-time on-chain event sync (manual DB updates)
3. Dispute window is fixed 24h (no per-bet config)
4. Public devnet RPC has rate limits — use Helius/QuickNode for heavy usage
