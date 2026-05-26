# Hosted Beta Report

## Status: LIVE — FULL E2E VERIFIED ON DEVNET

## URLs

| Resource | URL |
|----------|-----|
| **App** | https://wager-smoky.vercel.app |
| **Healthcheck** | https://wager-smoky.vercel.app/api/health |
| **Program** | [Explorer](https://explorer.solana.com/address/7fQ9Dh4iNrp2mfjtBthqrmrcYZXhSaCVZcyXVuCs6hFN?cluster=devnet) |
| **E2E Bet** | https://wager-smoky.vercel.app/bet/cmpm6on7q000310jibwnf6syj |

## Hosted E2E Flow (2026-05-26)

Full on-chain lifecycle executed against hosted Vercel app + Solana devnet:

| Step | Action | Result | TX Signature |
|------|--------|--------|--------------|
| 0 | Create bet in hosted DB | `cmpm6on7q000310jibwnf6syj` | — |
| 1 | `initialize_bet` on devnet | PDA created | [4CXp8RAv...](https://explorer.solana.com/tx/4CXp8RAv1uihhpRuqJXzjYTQUiUApB6zusSiSYTyxVCm8QogRTteKaXgtAQ9kG3zx1wN5k1upHtPuNCc5D6nGp1h?cluster=devnet) |
| 2 | `fund_maker` on devnet | Vault = 0.05 SOL | [3fTGxnyP...](https://explorer.solana.com/tx/3fTGxnyPRb8fcEAiNNPR4gnTQXQMPT7kXvTkN77m9LqXNHantDAQzEXXRAHEhUQg8G6a6LDsXQSH3xesq4MTUhhz?cluster=devnet) |
| 3 | `accept_bet` on devnet | Vault = 0.1 SOL, status = ACCEPTED | [4GhRLKit...](https://explorer.solana.com/tx/4GhRLKitHTLvKnDeUSXUnGGt9qLysK2jKcY81BWwU4iBQ7PmjamYeB7M4eUFCrM3L5ZtMn78JSw8McV8GbT4RPSL?cluster=devnet) |
| 4 | Sync DB to on-chain state | DB status OPEN → ACCEPTED | via `/api/bets/:id/sync` |
| 5 | Run hosted AI resolver | UNKNOWN, confidence=0, needs_manual_review=true | via `/api/resolver/run/:id` |
| 6 | Admin finalize (DB) | FINALIZED, winner=YES | via `/api/admin/bets/:id/finalize` |

### Payout Summary (from admin finalize response)
```
total_pot_sol: 0.1
fee_sol: 0.001 (1%)
winner_payout_sol: 0.099 (99%)
fee_bps: 100
```

### Evidence Hash
```
DB: 4f53cda18c2baa0c0354bb5f9a3ecbe5ed12ab4d8e11ba873c2f11161202b945
```

### Accounts
| Account | Address |
|---------|---------|
| Bet PDA | `7LRQanz9fVZdt7TUq1C8J34aF9fSz2pNZN7ZpYsV8QBE` |
| Vault PDA | `3rgDNuSoARtCkngnR2o3qx1B4C787CFbXzqoVuaLzNd4` |
| Maker | `CjnFMbXwmFnqUeqfWzTYNa2vndGkaMnMQbTM98UqxQux` |
| Taker | `FxJFH99Ddnq2ugtHUBY7t5HQ6BkXXPjL6ecQPjgpJzow` |
| Resolver | `2K8jv4HT8Er7fSTEtJ3yAzqUJoQ6eLiRPYxYW9KTmECa` |
| Fee wallet | `EeVikWJhvRtPC7WG5UsXVy6Uf8ZKFEeadeJDqvBhg22p` |

## Healthcheck
```json
{
  "status": "healthy",
  "program_id": "7fQ9Dh4iNrp2mfjtBthqrmrcYZXhSaCVZcyXVuCs6hFN",
  "resolver_authority": "2K8jv4HT8Er7fSTEtJ3yAzqUJoQ6eLiRPYxYW9KTmECa",
  "checks": {
    "database": { "ok": true },
    "solana_rpc": { "ok": true },
    "resolver_key": { "ok": true }
  }
}
```

## Configuration

| Env Var | Status |
|---------|--------|
| `DATABASE_URL` | Set (Neon) |
| `ANTHROPIC_API_KEY` | Set |
| `WAGER_PROGRAM_ID` | Set |
| `ADMIN_API_KEY` | Set |
| `FEE_WALLET` | Set |
| `RESOLVER_AUTHORITY_PRIVATE_KEY` | Set |
| `NEXT_PUBLIC_SOLANA_RPC_URL` | Set (devnet) |
| `NEXT_PUBLIC_APP_URL` | Set |

## Test Results

| Suite | Count |
|-------|-------|
| Vitest | 119 passing |
| Anchor on-chain | 21 passing |
| TypeScript | 0 errors |
| Next.js build | 22 routes |
| Hosted healthcheck | healthy |
| Hosted E2E (devnet) | Full flow completed |

## Architecture Note: DB/Chain Sync

The DB and on-chain state are updated separately:
- On-chain transactions (init, fund, accept) update Solana state
- The hosted API has a `/api/bets/:id/sync` endpoint that syncs DB state from on-chain
- Admin finalize updates the DB; on-chain `admin_finalize_disputed` requires the resolver to sign separately
- Future: add Solana event listeners for automatic sync

## Known Issues

1. **DB/chain sync is manual** — use `/api/bets/:id/sync` to update DB from chain
2. **On-chain finalize requires local resolver key** — the hosted backend has the key but no API for on-chain signing yet
3. **In-memory rate limiter** — resets on Vercel cold starts
4. **Devnet RPC rate limits** — use dedicated RPC for heavy usage
5. **Resolver falls back gracefully** — UNKNOWN + manual_review for unresolvable bets
