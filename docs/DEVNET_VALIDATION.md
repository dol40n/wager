# Devnet Validation

This document preserves reproducible evidence from historical Solana devnet
checks. It is a validation record, not a claim that the current source tree has
been independently audited or that a hosted application is online.

## Current network check

Rechecked through the public Solana devnet RPC on 2026-07-14:

- Program `7fQ9Dh4iNrp2mfjtBthqrmrcYZXhSaCVZcyXVuCs6hFN` exists and is executable.
- Every transaction signature listed below returned `finalized` with no
  execution error.
- The former Vercel URL returned `404 DEPLOYMENT_NOT_FOUND`; there is currently
  no active hosted demo.

[Open the program in Solana Explorer](https://explorer.solana.com/address/7fQ9Dh4iNrp2mfjtBthqrmrcYZXhSaCVZcyXVuCs6hFN?cluster=devnet).

## Lifecycle record: direct devnet smoke test

Recorded on 2026-05-26 with 0.05 devnet SOL per side and a 1% fee. The flow
covered initialize, maker funding, taker acceptance, result proposal, dispute
and admin finalization.

| Step | Transaction |
|---|---|
| `initialize_bet` | [3AjA…Vp9](https://explorer.solana.com/tx/3AjAejbEN1Fr5k4NAWRbWNw5ifGrZYcMiwNT1FSPp7w7BKwFTZKQNKMwNpiswb7XX1DhKRVF5h8nfyqNcdKaxVp9?cluster=devnet) |
| `fund_maker` | [7oui…wUz](https://explorer.solana.com/tx/7ouiQ2PLEW5PmeYi11wNa1NySjaEedPvh7aaEzzpbi6Bfep7hxRhG5NgwygSAWaCnoXr7Ai2cN9WhF72kfFhwUz?cluster=devnet) |
| `accept_bet` | [5nGt…AR2](https://explorer.solana.com/tx/5nGtCWMEVa41DAzA8WmYzxDcoZZTzBFzKiXGMVek8ZgetKL26vMhjudRxejLQtoXvYUEciKRmCc1LWKKGSvnrAR2?cluster=devnet) |
| `propose_result` | [2FCc…vFM](https://explorer.solana.com/tx/2FCcxp2875Yza5J6ZGvjV3aBREjgoxQhj13HBBP5tjgaYUGwwkxdDXH9Y9wQ6J7bV7f4sTikWhfdMYRwQF8UvvFM?cluster=devnet) |
| `dispute_result` | [2hta…nDj](https://explorer.solana.com/tx/2htagLmaNg5oxYN63YXMiXUD7oG6aXsBbv3V869psUehhBpAAJ7ZPJgugGkyTNYr8hfsTUNNuKRQ3F9skHBzWnDj?cluster=devnet) |
| `admin_finalize_disputed` | [2ELx…U6](https://explorer.solana.com/tx/2ELxyqnpvKnXmQcimLdxrFcwV3HN1ijT9jnSVGxA98HWPgYuyfcj9niSsRibb7Qdkw2Ws73MZvzm4fMZdqEJC1U6?cluster=devnet) |

Observed at the time of the run:

- vault balance after finalization: 0 lamports;
- maker payout: 0.099 devnet SOL;
- fee transfer: 0.001 devnet SOL;
- stored evidence hash matched the SHA-256 digest computed by the test.

## Lifecycle record: hosted backend settlement

Also recorded on 2026-05-26. This run exercised the then-hosted backend and a
separate wager through final settlement.

| Step | Transaction |
|---|---|
| `initialize_bet` | [5B1r…iccN](https://explorer.solana.com/tx/5B1rYifUCBgXdcLHeiLadBS5xYhxSULCsJwoDzdz9cAK7TM3LezJ2Pa5erB3DJg8HEQXUP7F4Q3Mf5BpEJMxiccN?cluster=devnet) |
| `fund_maker` | [2AnD…Ndch](https://explorer.solana.com/tx/2AnDzEAgNk4ERYnmE16RkaLFgxJVVc9fAe5TnW7q4AEQ5yYJa4MB8gsNpiVeXyirXejJAatZQuiVEU4Xfz2mNdch?cluster=devnet) |
| `accept_bet` | [2hsi…RhZm](https://explorer.solana.com/tx/2hsiUsFFswFQ15C7evA49bFTpVPn82mJEdYGANiQcegxdKoKs6M1rzjk5o553v4a6nqnXygTJTUUvxoZUmtFRhZm?cluster=devnet) |
| `propose_result` | [4ZVJ…zeNi](https://explorer.solana.com/tx/4ZVJeEzWNsbfF9dQhJtC6wTYmcBBwuMuhjBdehaJu1B1Wzaz6SbVcdgmAPEzCYTbKVwZJ37pC8bTUSKpocPhzeNi?cluster=devnet) |
| `dispute_result` | [ms89…bC7e](https://explorer.solana.com/tx/ms89ZrMeaQwhZi3vyQFV4KtrekQDP12gP6rbtuGqYb63GftXTkDAaFx3UZQH2BuQLX71joqNVJi72HXo6q8bC7e?cluster=devnet) |
| `admin_finalize_disputed` | [3TQ9…VnwiT](https://explorer.solana.com/tx/3TQ9QiCWir12rgFhyuEGQ4CvLtLMHe2v8JNMCmjBjYLumA1UxqQx6wYsnNnDPSGmMwpiRDASTyXjUiYZU9wVnwiT?cluster=devnet) |

The recorded postconditions were a zero vault balance, a 0.099 devnet SOL
winner payout, a 0.001 devnet SOL fee and matching finalized status in the
database and program account.

## Reproduce the devnet smoke test

The test is intentionally separate from the default local suite because it
submits real devnet transactions and requires a funded test wallet:

```bash
export ANCHOR_WALLET="$HOME/.config/solana/id.json"
anchor run test-devnet --provider.cluster devnet
```

Prerequisites and pinned versions are in [`../TOOLCHAIN.md`](../TOOLCHAIN.md).
Review the test source at `tests/anchor/devnet-smoke.ts` before running it.

## Scope limitations

- Devnet SOL has no real-world value.
- A finalized historical transaction does not prove that current HEAD was the
  exact source of the deployed program binary.
- The hosted-backend record is historical; its former deployment is offline.
- The program has not received an independent security audit.
- Local tests and build checks are reported separately in the repository README
  and should be rerun for each commit.
