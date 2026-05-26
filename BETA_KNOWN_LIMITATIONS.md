# Beta Known Limitations

**Version**: v0.1 private beta (devnet only)

## Not Production-Ready

This software is an unaudited devnet prototype. It is **not** ready for mainnet, real money, or production use.

## AI Resolution

- The AI resolver uses Claude's training data and general knowledge, not live API feeds
- For crypto price bets, actual CoinGecko/Binance API integration is planned but not yet implemented
- The AI may return UNKNOWN for conditions it cannot verify, triggering manual review
- Subjective or ambiguous conditions may produce incorrect results
- Evidence URLs cited by the AI may not be real — evidence is hashed at resolution time
- Conflicting evidence or low confidence (<80%) automatically flags for manual review

## Trust Model

- The **resolver authority** is a single backend-controlled keypair — not a DAO or decentralized oracle
- The admin can finalize any disputed bet as YES, NO, or refund
- All admin actions are logged with before/after status and payout details
- There is no on-chain governance or multi-sig for admin actions

## Smart Contract

- The Anchor program has **not been audited** by an independent security firm
- No formal verification has been performed
- The program is deployed on devnet only — different from mainnet conditions
- PDA escrow is non-custodial but relies on correct program logic

## Legal

- No legal review of the wager mechanism has been conducted
- Regulatory compliance (gambling laws, securities laws) has not been assessed
- Users are responsible for compliance with their local laws
- The platform does not verify user identity or jurisdiction

## Technical

- **No wallet adapter**: Users must enter pubkeys manually for some operations
- **DB/chain sync**: On-chain and database state are synced via admin `/sync` endpoint, not real-time event listeners
- **Rate limits**: In-memory, reset on Vercel cold starts — not production-safe
- **Dispute window**: Fixed 24 hours, not configurable per bet
- **Public devnet RPC**: Rate-limited — use a dedicated RPC provider for heavy usage
- **No email/push notifications**: Users must check the app manually
- **No mobile optimization**: Desktop-first UI

## What Should Be Escrowed

Only bets with **objective, verifiable conditions** should be created:
- Crypto prices at a specific time from a specific source
- Sports match outcomes from official records
- Election results from official government sources
- Publicly verifiable events with clear data sources

Do **not** create bets on:
- Subjective opinions ("best movie")
- Private information ("what I ate for lunch")
- Events with no public verification method
- Illegal or harmful outcomes

## Mainnet Blockers

Before mainnet:
1. Independent smart contract security audit
2. Replace single resolver with multi-sig or oracle
3. Production rate limiting (Redis/Upstash)
4. Per-user admin authentication
5. Real-time on-chain event listeners
6. Live API resolution sources (CoinGecko, ESPN, etc.)
7. Legal and regulatory review
8. Wallet adapter integration
9. Mobile-responsive UI
10. Monitoring and alerting infrastructure
