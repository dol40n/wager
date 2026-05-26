# Security Review

## Threat Model

### Assets
1. **Escrowed SOL** in vault PDAs (devnet only)
2. **Bet resolution integrity** — correct winner must receive payout
3. **Evidence integrity** — evidence hash on-chain must match stored evidence
4. **User data** — wallet pubkeys, bet history (public by design on Solana)

### Actors
| Actor | Capabilities | Trust Level |
|-------|-------------|-------------|
| Maker | Create bets, fund escrow, cancel unfunded, dispute | Untrusted |
| Taker | Accept bets, fund escrow, dispute | Untrusted |
| Resolver authority | Propose results, admin finalize, admin refund | Trusted (backend keypair) |
| AI resolver | Propose winner + evidence | Semi-trusted (validated by dispute window) |
| Admin | Finalize disputed bets, refund, run resolver | Trusted (API key holder) |
| Frontend | Display data, build transactions | Untrusted (cannot choose winner) |

### Trust Assumptions
1. The **resolver authority keypair** is kept secret on the backend. If compromised, an attacker can propose arbitrary winners and finalize disputed bets.
2. The **admin API key** is kept secret. If compromised, an attacker can finalize or refund any bet.
3. The **Solana devnet** is honest (no validator collusion). On mainnet, this extends to validator set assumptions.
4. The **AI model** may be wrong. The dispute window and admin review are the safety nets.
5. **Clock** is honest (Solana validator clock is used for deadline/dispute checks).

## On-Chain Security

### Verified
- [x] Only resolver authority can call `propose_result` (has_one constraint)
- [x] Only resolver authority can call `admin_finalize_disputed` (has_one constraint)
- [x] Only maker can call `cancel_unaccepted_bet` (has_one constraint)
- [x] Only maker or taker can call `dispute_result` (checked in handler)
- [x] Status transitions are enforced (InvalidStatus error)
- [x] Deadline must be in the future at init (DeadlinePast)
- [x] Deadline must be passed for propose_result (DeadlineNotReached)
- [x] Dispute window must be active for dispute_result (DisputeWindowExpired)
- [x] Dispute window must be expired for finalize (DisputeWindowActive)
- [x] Stake cannot be zero (ZeroStake)
- [x] Stake cannot exceed 10 SOL (StakeExceedsMax)
- [x] Fee cannot exceed 5% (FeeTooHigh)
- [x] allowed_taker is enforced when set (TakerNotAllowed)
- [x] Double accept prevented (status check)
- [x] Double finalize prevented (status check)
- [x] Refund only for Open/Accepted/Disputed (NotExpiredOrResolved)
- [x] Refund requires 7-day timeout (DeadlineNotReached)
- [x] Vault PDA transfers use invoke_signed (not raw lamport manipulation)
- [x] Fee calculation uses checked arithmetic (Overflow error)
- [x] proposed_winner must be maker or taker pubkey

### Not Verified (Mainnet Blockers)
- [ ] Formal verification of the Anchor program
- [ ] Independent security audit
- [ ] Reentrancy analysis (CPI attack surface)
- [ ] Account confusion attacks (PDA seed collision)
- [ ] Compute budget exhaustion (large account state)
- [ ] Rent exemption edge cases

## Off-Chain Security

### Verified
- [x] Zod validation on all API inputs
- [x] Admin endpoints require x-admin-api-key header
- [x] AI resolver output validated with Zod schema
- [x] Low-confidence results flagged for manual review
- [x] Conflicting evidence flagged for manual review
- [x] Evidence canonicalized before hashing (deterministic)
- [x] Admin actions require typed confirmation (FINALIZE/REFUND)
- [x] Admin actions logged to database with before/after status
- [x] Rate limiting on create (5/min) and normalize (10/min) endpoints
- [x] Max 10 active bets per wallet
- [x] Content safety blocklist for illegal/harmful topics
- [x] No private keys in code (.env.example only)
- [x] Prisma parameterized queries (no SQL injection)
- [x] CORS headers on Actions endpoints

### Known Risks
1. **In-memory rate limiter resets on cold start.** Not effective on serverless. Use Redis/Upstash for production.
2. **Admin API key is a single shared secret.** No per-user admin accounts, no MFA, no session management.
3. **DB and chain state can diverge.** If a chain transaction succeeds but DB update fails, state is inconsistent. No reconciliation mechanism.
4. **AI can be manipulated.** Carefully crafted wager text may cause the AI to produce incorrect normalizations. The ambiguity score and admin review mitigate this.
5. **Evidence URLs are AI-generated.** They may not be real or may change after resolution. Evidence is hashed at resolution time, not fetched again at finalize.
6. **No webhook for on-chain events.** Status sync between chain and DB is manual.
7. **Content blocklist is keyword-based.** Can be bypassed with creative spelling or encoded language. AI normalize provides secondary filtering.

## Non-Goals (Devnet Beta)
- Mainnet deployment
- Decentralized resolver (DAO/oracle)
- Formal verification
- SOC 2 compliance
- GDPR compliance (no PII stored beyond pubkeys)
- DDoS protection (relies on Vercel/infra provider)

## Mainnet Blockers
1. Independent security audit of the Anchor program
2. Replace single resolver authority with multi-sig or oracle
3. Production rate limiting (Redis/Upstash)
4. Admin authentication with per-user accounts
5. DB-chain state reconciliation via event listeners
6. Formal verification or extensive fuzzing
7. Legal review of the wager mechanism
8. Insurance or reserve fund for edge cases

## Audit Checklist

For a future security audit, focus on:

1. **Anchor program**: All 9 instructions, PDA derivation, fee math, status transitions
2. **Vault PDA ownership**: Ensure no way to drain without correct signer_seeds
3. **Resolver authority**: Can it be changed? Can a bet be created with attacker as resolver?
4. **Evidence hash**: Can it be set to zero? Can it be overwritten?
5. **Refund logic**: Can both maker and taker claim the full pot? Integer overflow in half calculation?
6. **Admin API**: Can admin finalize a bet that was already paid out on-chain?
7. **AI prompt injection**: Can wager text manipulate the AI to always return YES/NO?
8. **Blink transaction**: Can the serialized transaction be modified before signing?
