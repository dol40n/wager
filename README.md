# Wager - AI-Powered P2P Bet Escrow on Solana

**WARNING: This is experimental devnet software. Do not use real funds.**

Universal AI-powered peer-to-peer wager escrow using Solana Blinks. Create a bet on any topic in natural language, AI normalizes conditions, funds are held in PDA escrow, and AI resolves outcomes with evidence-backed results.

## Architecture

```
User → Next.js Frontend → API Routes → Prisma/PostgreSQL
                                     → Anthropic AI (normalize + resolve)
                                     → Solana Devnet (PDA escrow)
                                     → Solana Actions/Blinks (taker acceptance)
```

## Tech Stack

- **Frontend**: Next.js 15, TypeScript, Tailwind CSS, shadcn/ui
- **Backend**: Next.js API routes, Prisma ORM, PostgreSQL
- **AI**: Anthropic Claude (normalize wagers + resolve outcomes)
- **Blockchain**: Solana devnet, Anchor program, PDA escrow, Solana Actions/Blinks

## Prerequisites

- Node.js 20+
- PostgreSQL database
- Anthropic API key
- Solana CLI + Anchor (for program deployment only)
- Rust toolchain (for program compilation only)

## Quick Start

### 1. Clone and install

```bash
cd wager
npm install
```

### 2. Configure environment

```bash
cp .env.example .env
```

Edit `.env` with your values:
- `DATABASE_URL` — PostgreSQL connection string
- `ANTHROPIC_API_KEY` — your Anthropic API key
- `ADMIN_API_KEY` — any secret string for admin endpoints
- `WAGER_PROGRAM_ID` — deployed program ID (after step 4)
- `RESOLVER_AUTHORITY_PRIVATE_KEY` — base58 keypair for the resolver
- `FEE_WALLET` — pubkey that receives fees

### 3. Set up database

```bash
npx prisma db push
```

### 4. Deploy Solana program (requires Solana toolchain)

```bash
# Install Solana CLI and Anchor if not present
# See: https://docs.solana.com/cli/install
# See: https://www.anchor-lang.com/docs/installation

solana config set --url devnet
solana airdrop 5

cd programs/wager_escrow
anchor build
anchor deploy --provider.cluster devnet

# Copy the program ID to .env as WAGER_PROGRAM_ID
```

### 5. Run the app

```bash
npm run dev
```

Visit `http://localhost:3000`.

## Core Flow

1. **Create wager** (`/create`): Describe bet in natural language
2. **AI normalizes**: Converts to precise YES/NO condition with resolution criteria
3. **Review & confirm**: User reviews normalized condition, ambiguity warnings
4. **Fund escrow**: Maker deposits SOL into PDA escrow
5. **Share Blink**: Copy the Blink URL and send to counterparty
6. **Taker accepts**: Taker opens Blink, deposits matching SOL
7. **Deadline passes**: AI resolver gathers evidence
8. **Result proposed**: AI proposes winner with evidence hash on-chain
9. **Dispute window**: 24 hours for either party to dispute
10. **Finalize**: Payout or admin review if disputed

## API Routes

| Method | Route | Description |
|--------|-------|-------------|
| POST | `/api/bets/normalize` | AI normalize wager condition |
| POST | `/api/bets/create` | Create bet in database |
| GET | `/api/bets` | List bets (filter by status, maker) |
| GET | `/api/bets/:id` | Get bet details |
| POST | `/api/bets/:id/fund-maker/tx` | Build fund maker transaction |
| GET | `/api/actions/bet/:id` | Blink GET action metadata |
| POST | `/api/actions/bet/:id/accept` | Blink POST accept transaction |
| POST | `/api/bets/:id/dispute` | File a dispute |
| POST | `/api/resolver/run` | Run resolver on all eligible bets |
| POST | `/api/resolver/run/:id` | Run resolver on specific bet |
| GET | `/api/resolver/evidence/:id` | Get resolution evidence |
| POST | `/api/admin/bets/:id/finalize` | Admin finalize (YES/NO) |
| POST | `/api/admin/bets/:id/refund` | Admin refund |

## Solana Program Instructions

1. `initialize_bet` — Create bet PDA with parameters
2. `fund_maker` — Maker deposits stake into vault PDA
3. `accept_bet` — Taker deposits matching stake
4. `cancel_unaccepted_bet` — Maker cancels unfilled bet
5. `propose_result` — Resolver proposes winner with evidence hash
6. `dispute_result` — Maker or taker disputes within window
7. `finalize_result_after_dispute_window` — Auto-finalize after dispute window
8. `admin_finalize_disputed` — Admin resolves disputed bets
9. `refund_if_expired_or_unresolved` — Refund after timeout

## Safety Features

- **Max stake**: 10 SOL (devnet limit)
- **PDA escrow**: Non-custodial, funds held by program
- **Dispute window**: 24 hours before finalization
- **Refund path**: 7-day timeout auto-refund
- **Evidence hashing**: SHA-256 hash stored on-chain
- **Manual review**: Low-confidence or conflicting results flagged
- **Wager rejection**: Subjective, illegal, or unverifiable bets rejected
- **Ambiguity warnings**: Score > 0.25 requires explicit confirmation
- **Admin auth**: API key required for admin endpoints
- **Zod validation**: All inputs validated at system boundaries
- **Devnet only**: No mainnet configuration

## Development

```bash
npm run dev          # Start dev server
npm run build        # Production build
npm run test         # Run tests
npm run typecheck    # Type check
npm run lint         # ESLint
npm run db:studio    # Prisma Studio (DB GUI)
```

## Project Structure

```
src/
├── app/
│   ├── api/              # API route handlers
│   ├── admin/            # Admin review page
│   ├── bet/[id]/         # Bet detail page
│   ├── create/           # Create bet page
│   ├── dashboard/        # All bets listing
│   └── actions.json/     # Solana Actions manifest
├── components/           # React components + shadcn/ui
├── lib/
│   ├── ai/               # AI normalize + resolver modules
│   ├── solana/            # Program interaction, PDA derivation, tx builders
│   ├── db.ts             # Prisma client
│   ├── constants.ts      # Config constants
│   ├── validators.ts     # Zod schemas
│   └── utils.ts          # Utilities
└── types/                # TypeScript type definitions

programs/
└── wager_escrow/         # Anchor Solana program (Rust)

tests/                    # Vitest test suite
prisma/                   # Prisma schema
```

## Assumptions

- Resolver authority is a backend-controlled keypair (not a DAO/oracle)
- Evidence is gathered by AI at resolution time, not streamed
- Admin auth uses a simple API key (placeholder for proper auth)
- On-chain finalization and DB status are updated separately (not atomic)
- Blink taker acceptance triggers on-chain accept; DB is updated via webhook/polling (not implemented yet — manual sync for MVP)
- Fee is 2% (200 bps), configurable per bet

## Known Limitations (MVP)

- No wallet adapter integration in frontend (pubkeys entered manually)
- No on-chain event listeners / webhooks for status sync
- No rate limiting implementation (placeholder noted)
- Admin auth is a simple API key, not proper session auth
- Resolver uses AI knowledge, not live API calls to resolution sources
- No mainnet support — devnet only
