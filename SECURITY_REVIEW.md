# Security Self-Assessment

> This is a maintainer self-assessment of an experimental Solana devnet
> project. It is not an independent audit, certification or mainnet-readiness
> statement. Do not use the project with real funds.

Review date: 2026-07-14.

## Scope

The review covered:

- the Anchor program and its nine instructions;
- Next.js API routes, cron handlers and Solana transaction builders;
- PostgreSQL/Prisma state and DB/chain synchronization;
- external resolution and evidence integrations;
- the current Git tree and all 62 commits reachable from audit baseline
  `1d7ecf493bdfca66749804370c61e077e6423147` for committed secrets;
- public documentation and deployment claims.

Automated scanning was supplemented with named-secret checks because generic
entropy scanners do not reliably detect human-readable application secrets.

## Security status

The project demonstrates several useful controls, but the current trust model
and known implementation gaps make it unsuitable for real funds:

- the program is devnet-only and has not received an independent audit;
- one backend resolver key and one shared admin secret are privileged;
- the application dispute window is not the same as the on-chain window;
- the API refund path can update PostgreSQL without moving vault funds;
- maker-funding, initialization and fee-destination invariants are not fully
  constrained on-chain;
- a historical admin credential was committed and requires rotation.

See [`docs/KNOWN_LIMITATIONS.md`](docs/KNOWN_LIMITATIONS.md) for the complete
operational and mainnet-blocker list.

## Assets and trust boundaries

| Asset or actor | Current trust assumption |
|---|---|
| Vault PDA | The Anchor program is solely responsible for authorized transfers |
| Maker / taker | Untrusted wallet signers |
| Frontend | Untrusted transaction-request client |
| Next.js API | Trusted to calculate fees, construct expected transactions and coordinate state |
| PostgreSQL | Trusted for application workflow, disputes, evidence and audit metadata |
| Resolver authority | Trusted backend key with result, dispute and finalize powers |
| Admin | Holder of a shared API secret; no per-user identity or MFA |
| Anthropic / Tavily / market APIs | Untrusted external inputs that can be wrong or unavailable |
| Solana devnet | Test network only; availability and state can differ from mainnet |

Compromise of the resolver key can lead to arbitrary result proposals and
privileged disputed finalization. Compromise of the admin secret exposes admin
and resolver endpoints. Neither risk is decentralized by the current design.

## Implemented controls

### On-chain

- PDA-derived bet and vault accounts.
- Status checks prevent double acceptance and duplicate finalization.
- Resolver-authority checks protect result proposal and disputed finalization.
- Maker, taker or resolver authority may submit an on-chain dispute.
- Stake is non-zero, capped at 10 devnet SOL and uses checked payout arithmetic.
- Fees are capped at 5% by the program.
- The 24-hour dispute and seven-day refund timeouts use the Solana clock.
- Winner accounts must match a recorded participant.
- Vault transfers use PDA signer seeds.
- A 32-byte evidence hash is stored with the proposed result.

These controls do not replace review of the unconstrained fee destination and
initialization inputs described below.

### Off-chain

- Core normalize, create, dispute and finalize payloads use Zod; model outputs
  are also schema-checked.
- Admin and cron secrets are compared with `timingSafeEqual`.
- Create and normalize use an atomic PostgreSQL fixed-window counter.
- Fees are recalculated by the create API instead of trusting `fee_bps` from the
  request body.
- Newly executed finalization confirms Solana execution and verifies an empty
  vault before the database is marked `FINALIZED`.
- `settleOnChain()` resumes from known intermediate statuses and treats an
  already-finalized program account as a retry success. That recovery branch
  does not repeat the final-winner or vault-postcondition checks.
- A scheduled job polls non-terminal records and repairs selected DB fields
  from the Anchor account and vault balance.
- Evidence is canonicalized before SHA-256 hashing.
- Low-confidence or challenged model results are routed to manual review.
- CI combines a redacted full-history generic-secret scan with a tested
  named-credential guard. The latter validates the current tree,
  `.env.example`, and every added line after the audited Git baseline above.

The scope of each control matters: rate limiting is fail-open and protects only
two routes; Zod is not used at every API boundary; reconciliation is not a full
event projection.

## Findings

### High: committed admin credential

A project-specific admin credential was hardcoded in three privileged hosted
test scripts:

| Historical path | First commit | Committed | Rotation |
|---|---|---:|---:|
| `scripts/hosted-e2e.ts` | `35d34d8` | Yes | Required |
| `scripts/hosted-e2e.mjs` | `35d34d8` | Yes | Required |
| `scripts/fresh-e2e-onchain.mjs` | `076c189` | Yes | Required |

At the audit baseline above, the same credential is reachable in 55 of 62
commits. The current-tree files are removed on the cleanup branch, but deletion
does not invalidate a credential or erase Git history.

Required response:

1. revoke the old admin value in every hosting/backend environment;
2. create a new high-entropy admin secret and an independent `CRON_SECRET`;
3. review request, deployment and CI logs from the first exposure date;
4. do not restore privileged hosted scripts without mandatory environment input
   and an explicit mutation opt-in;
5. decide on coordinated history cleaning only after rotation.

History cleaning would require a separately approved `git filter-repo` or
equivalent operation, force-updating every affected ref and requiring all
collaborators to re-clone. Forks, old clones and caches cannot be recalled, so
rotation remains mandatory even if history is rewritten.

### High: refund API does not execute an on-chain refund

`POST /api/admin/bets/:id/refund-onchain` reads the vault balance and marks the
database row `REFUNDED`, but it does not submit
`refund_if_expired_or_unresolved`. Funds can remain in the vault while the
application shows a terminal refund state. This is an explicit blocker, not an
atomic settlement path. The route also accepts database `RESULT_PROPOSED`, while
the program refund instruction does not accept the corresponding on-chain
status, so its promised later refund is not always available. Because the route
does not decode the on-chain status, stale database state can also relabel an
already-finalized on-chain wager as `REFUNDED` in PostgreSQL.

### High: maker funding is not enforced as an on-chain invariant

`fund_maker` transfers one stake but does not change program status or record a
funded flag, so the maker can call it repeatedly while the wager is `Open`.
`accept_bet` transfers the taker stake without requiring the vault to contain
exactly one maker stake first. The backend normally sequences and observes
funding, but a directly constructed transaction can accept an unfunded or
overfunded wager and produce a pot that payout math does not expect.

### High: fee destination is not constrained by the program

Both finalize instructions accept a writable fee-wallet account without
checking it against an address stored in program state. The backend supplies
its configured address, but the permissionless finalization instruction does
not enforce that destination on-chain.

### High: initialization trust is stronger off-chain than on-chain

The program stores the resolver authority supplied during initialization and
only bounds the submitted fee. The backend constructs an unsigned maker
transaction; a separately constructed transaction can bypass the backend's
intended resolver and fee selection. Later sync/accept paths do not compare
every stored field with the PostgreSQL record.

### High: application and on-chain dispute flows diverge

The resolver starts a 24-hour deadline in PostgreSQL. Finalization later
publishes the proposal on-chain, immediately disputes it with the resolver key
and uses privileged disputed finalization. The user-facing application window
therefore does not derive its enforcement from the Anchor program's natural
dispute deadline.

### High: dispute requests do not prove wallet ownership

The dispute route accepts a `wallet_pubkey` string and checks whether the
corresponding database wallet belongs to the maker or taker. It does not require
a signed nonce or transaction. Participant public keys are public, so another
caller can submit a dispute while claiming either party's address.

### Medium: partial input validation and content enforcement

Zod covers several core payloads, but fund, Action accept, sync, refund and list
inputs use manual or narrower checks. Content/ambiguity guards run during
normalization and are not repeated when a client calls create directly with
its own normalized fields.

### Medium: partial reconciliation

The daily job handles non-terminal DB rows and selected fields. It does not
repair terminal rows, recover signatures, process program events or
independently derive every finalization field.

### Medium: settlement recovery has incomplete postcondition checks

An already-finalized retry is accepted without independently comparing the
requested winner to the on-chain final winner or checking the vault balance.
A retry from `ResultProposed` always attempts to dispute; after the on-chain
dispute deadline, it has no fallback to the natural permissionless finalize
instruction. Program status prevents a duplicate payout, but recovery can still
write an inconsistent database winner or require operator intervention.

### Medium: rate limiter fails open

The database-backed counter is atomic under normal operation. A database error
allows the request through by design, and only create/normalize are protected.

### Medium: evidence is a commitment, not an oracle proof

Evidence content and URLs remain off-chain and can become unavailable. The
program stores a hash but does not verify the accuracy of the sources or model
conclusion. Crypto resolution does not currently fetch a historical price
exactly at the deadline.

### Medium: dependency audit requires follow-up

On 2026-07-14, `npm audit --omit=dev` reported 19 moderate findings and no
high/critical production findings. The full locked graph reported 27 findings:
1 low, 23 moderate and 3 high, with the high findings in development tooling.
The available automated remediation includes compatibility-significant version
changes, so no blind `npm audit fix --force` was applied.

## Repository secret audit

The full reachable history, commit messages, deleted files and current tree were
checked with Gitleaks 8.30.1 in fully redacted mode plus custom checks for named
credentials, provider token formats, private-key material, mnemonic phrases,
private RPC URLs and sensitive filenames.

No additional real secrets were found:

- no committed `.env` file;
- no Anthropic, Tavily or Vercel token;
- no literal `CRON_SECRET`, credential-bearing `DATABASE_URL` or private RPC URL;
- no PEM, seed phrase or Solana keypair material;
- no wallet/keypair JSON, database dump or credential-bearing log.

`.env.example` contains only local/demo values and empty secret fields. Public
program IDs, wallet addresses and transaction signatures are not secrets.

## Mainnet requirements

Before any real-funds use, at minimum:

1. complete credential rotation and incident review;
2. obtain an independent Anchor audit and add fuzz/property testing;
3. constrain funding, resolver, initialization and fee-destination invariants
   on-chain;
4. replace the single authority/shared secret model;
5. require signed dispute authorization and align disputes/refunds with
   enforceable on-chain workflows;
6. implement event-driven, terminal-aware reconciliation;
7. validate all external inputs consistently and add production rate limiting;
8. add key management, per-user admin identity, monitoring and incident response;
9. establish a migration strategy and disaster-recovery process;
10. complete legal and regulatory review.
