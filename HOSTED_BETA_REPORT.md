# Hosted Beta Report

## Status: LIVE — ON-CHAIN SETTLEMENT VERIFIED

**Version**: v0.1 private beta (devnet)

## URLs

| Resource | URL |
|----------|-----|
| **App** | https://wager-smoky.vercel.app |
| **Healthcheck** | https://wager-smoky.vercel.app/api/health |
| **Program** | [Explorer](https://explorer.solana.com/address/7fQ9Dh4iNrp2mfjtBthqrmrcYZXhSaCVZcyXVuCs6hFN?cluster=devnet) |

## On-Chain Settlement Proof

**Bet**: `cmpm7w0070003142km884p350`
**Page**: https://wager-smoky.vercel.app/bet/cmpm7w0070003142km884p350

| Step | TX Signature | Explorer |
|------|-------------|----------|
| initialize_bet | `5B1rYifUCBgXdcLHeiLadBS5xYhxSULCsJwoDzdz9cAK7TM3LezJ2Pa5erB3DJg8HEQXUP7F4Q3Mf5BpEJMxiccN` | [View](https://explorer.solana.com/tx/5B1rYifUCBgXdcLHeiLadBS5xYhxSULCsJwoDzdz9cAK7TM3LezJ2Pa5erB3DJg8HEQXUP7F4Q3Mf5BpEJMxiccN?cluster=devnet) |
| fund_maker | `2AnDzEAgNk4ERYnmE16RkaLFgxJVVc9fAe5TnW7q4AEQ5yYJa4MB8gsNpiVeXyirXejJAatZQuiVEU4Xfz2mNdch` | [View](https://explorer.solana.com/tx/2AnDzEAgNk4ERYnmE16RkaLFgxJVVc9fAe5TnW7q4AEQ5yYJa4MB8gsNpiVeXyirXejJAatZQuiVEU4Xfz2mNdch?cluster=devnet) |
| accept_bet | `2hsiUsFFswFQ15C7evA49bFTpVPn82mJEdYGANiQcegxdKoKs6M1rzjk5o553v4a6nqnXygTJTUUvxoZUmtFRhZm` | [View](https://explorer.solana.com/tx/2hsiUsFFswFQ15C7evA49bFTpVPn82mJEdYGANiQcegxdKoKs6M1rzjk5o553v4a6nqnXygTJTUUvxoZUmtFRhZm?cluster=devnet) |
| propose_result | `4ZVJeEzWNsbfF9dQhJtC6wTYmcBBwuMuhjBdehaJu1B1Wzaz6SbVcdgmAPEzCYTbKVwZJ37pC8bTUSKpocPhzeNi` | [View](https://explorer.solana.com/tx/4ZVJeEzWNsbfF9dQhJtC6wTYmcBBwuMuhjBdehaJu1B1Wzaz6SbVcdgmAPEzCYTbKVwZJ37pC8bTUSKpocPhzeNi?cluster=devnet) |
| admin_finalize | `3TQ9QiCWir12rgFhyuEGQ4CvLtLMHe2v8JNMCmjBjYLumA1UxqQx6wYsnNnDPSGmMwpiRDASTyXjUiYZU9wVnwiT` | [View](https://explorer.solana.com/tx/3TQ9QiCWir12rgFhyuEGQ4CvLtLMHe2v8JNMCmjBjYLumA1UxqQx6wYsnNnDPSGmMwpiRDASTyXjUiYZU9wVnwiT?cluster=devnet) |

### Settlement Result

| Check | Value |
|-------|-------|
| Vault balance after finalize | **0 SOL** |
| Winner (maker) received | **0.099 SOL** (99%) |
| Fee wallet received | **0.001 SOL** (1%) |
| DB status | **FINALIZED** |
| On-chain status | **Finalized** |
| TX signature stored in DB | Yes |
| AdminActionLog recorded | Yes |

### Accounts

| Role | Pubkey |
|------|--------|
| Program | `7fQ9Dh4iNrp2mfjtBthqrmrcYZXhSaCVZcyXVuCs6hFN` |
| Resolver | `2K8jv4HT8Er7fSTEtJ3yAzqUJoQ6eLiRPYxYW9KTmECa` |
| Maker | `CjnFMbXwmFnqUeqfWzTYNa2vndGkaMnMQbTM98UqxQux` |
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

## Safety

- DB-only `/finalize` and `/refund` return **HTTP 410 (disabled)**
- All settlement goes through `/finalize-onchain` which verifies vault=0 before updating DB
- TX signatures and payout details stored in Transaction + AdminActionLog tables

## Normalize Regression Tests (2026-05-26)

All three tests ran against the hosted production app after redeployment.

### Test 1: "биткоин вверх или вниз через 5 минут"
| Check | Result |
|-------|--------|
| should_reject | **true** |
| ambiguity_score | **0.30** |
| rejection_reason | "Directional wager — maker must choose UP or DOWN" |
| deadline_utc | 2026-05-26T06:57:19Z (now + 5min, NOT 2024) |
| deadline_year | **2026** |

### Test 2: "Will Bitcoin be above $100,000 on May 26 at 14:40 ET?"
| Check | Result |
|-------|--------|
| should_reject | **false** (valid) |
| deadline_utc | 2026-05-26T18:40:00Z (today, future time) |
| deadline_year | **2026** (not 2024) |

### Test 3: "Will Bitcoin be above $100,000 by 2026-06-01 18:00 UTC?"
| Check | Result |
|-------|--------|
| should_reject | **false** (valid) |
| YES | "reaches or exceeds $100,000 at any point on or before deadline per CoinGecko" |
| NO | "never reaches $100,000 at any point on or before deadline per CoinGecko" |
| Complements | Exact logical opposites |
| Source | CoinGecko (single) |

## Test Results

| Suite | Count |
|-------|-------|
| Vitest | 136 passing |
| Anchor on-chain | 21 passing |
| TypeScript | 0 errors |
| Next.js build | clean |
