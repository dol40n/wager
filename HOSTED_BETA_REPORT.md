# Hosted Beta Report

## Status: LIVE

The wager escrow devnet beta is deployed and publicly accessible.

## URLs

| Resource | URL |
|----------|-----|
| **App** | https://wager-smoky.vercel.app |
| **Healthcheck** | https://wager-smoky.vercel.app/api/health |
| **Program (Explorer)** | https://explorer.solana.com/address/7fQ9Dh4iNrp2mfjtBthqrmrcYZXhSaCVZcyXVuCs6hFN?cluster=devnet |

## Healthcheck Result

```json
{
  "status": "healthy",
  "program_id": "7fQ9Dh4iNrp2mfjtBthqrmrcYZXhSaCVZcyXVuCs6hFN",
  "checks": {
    "database": { "ok": true, "latencyMs": 310 },
    "solana_rpc": { "ok": true, "latencyMs": 61 }
  }
}
```

## Infrastructure

| Component | Provider | Details |
|-----------|----------|---------|
| Frontend/API | Vercel | Next.js 16, iad1 region |
| Database | Neon | PostgreSQL 17, us-east-2 |
| Blockchain | Solana devnet | Program ID `7fQ9Dh...6hFN` |
| AI | Anthropic | Claude Sonnet (normalize + resolve) |

## Program ID

`7fQ9Dh4iNrp2mfjtBthqrmrcYZXhSaCVZcyXVuCs6hFN`

## Devnet Test Transactions (from Phase 12)

| Instruction | Signature | Explorer |
|------------|-----------|----------|
| initialize_bet | `3AjAejb...` | [View](https://explorer.solana.com/tx/3AjAejbEN1Fr5k4NAWRbWNw5ifGrZYcMiwNT1FSPp7w7BKwFTZKQNKMwNpiswb7XX1DhKRVF5h8nfyqNcdKaxVp9?cluster=devnet) |
| fund_maker | `7ouiQ2P...` | [View](https://explorer.solana.com/tx/7ouiQ2PLEW5PmeYi11wNa1NySjaEedPvh7aaEzzpbi6Bfep7hxRhG5NgwygSAWaCnoXr7Ai2cN9WhF72kfFhwUz?cluster=devnet) |
| accept_bet | `5nGtCWM...` | [View](https://explorer.solana.com/tx/5nGtCWMEVa41DAzA8WmYzxDcoZZTzBFzKiXGMVek8ZgetKL26vMhjudRxejLQtoXvYUEciKRmCc1LWKKGSvnrAR2?cluster=devnet) |
| propose_result | `2FCcxp2...` | [View](https://explorer.solana.com/tx/2FCcxp2875Yza5J6ZGvjV3aBREjgoxQhj13HBBP5tjgaYUGwwkxdDXH9Y9wQ6J7bV7f4sTikWhfdMYRwQF8UvvFM?cluster=devnet) |
| dispute_result | `2htagLm...` | [View](https://explorer.solana.com/tx/2htagLmaNg5oxYN63YXMiXUD7oG6aXsBbv3V869psUehhBpAAJ7ZPJgugGkyTNYr8hfsTUNNuKRQ3F9skHBzWnDj?cluster=devnet) |
| admin_finalize | `2ELxyqn...` | [View](https://explorer.solana.com/tx/2ELxyqnpvKnXmQcimLdxrFcwV3HN1ijT9jnSVGxA98HWPgYuyfcj9niSsRibb7Qdkw2Ws73MZvzm4fMZdqEJC1U6?cluster=devnet) |

## Verified Balances (devnet test run)

| Account | Balance After |
|---------|--------------|
| Vault PDA | 0 lamports |
| Fee wallet | +0.001 SOL (1% of 0.1 SOL pot) |
| Winner | +0.099 SOL (99% of 0.1 SOL pot) |

## Evidence Hash Match

```
On-chain: 6c7de1439dffe7c6fd6545c47a2cbdd85046cb22f569e502cf34fa0836fdaf28
Computed: 6c7de1439dffe7c6fd6545c47a2cbdd85046cb22f569e502cf34fa0836fdaf28
Match: YES
```

## Test Results

| Suite | Count | Status |
|-------|-------|--------|
| Vitest (unit + adversarial + IDL + Borsh) | 111 passing | All green |
| Anchor on-chain (unit + e2e + devnet) | 21 passing | All green |
| TypeScript check | 0 errors | Clean |
| Next.js build | 21 routes | Clean |
| Healthcheck (hosted) | healthy | DB + RPC OK |

## Known Issues

1. **No wallet adapter**: Users must manually enter pubkey. Wallet adapter integration planned.
2. **No on-chain event listener**: DB and chain state sync is manual.
3. **In-memory rate limiter**: Resets on Vercel cold starts. Use Redis/Upstash for production.
4. **Devnet RPC rate limits**: The public devnet RPC has request limits. Use Helius/QuickNode for production.
5. **No ANTHROPIC_API_KEY set**: AI normalize and resolver endpoints require the key. Add via `vercel env add ANTHROPIC_API_KEY production`.
6. **Dispute window**: Fixed 24h, not configurable.

## For Beta Testers

See [PRIVATE_BETA.md](PRIVATE_BETA.md) for setup instructions, test scenarios, and bug reporting.
See [DEMO_SCRIPT.md](DEMO_SCRIPT.md) for a step-by-step demo walkthrough.
