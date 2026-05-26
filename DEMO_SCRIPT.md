# Demo Script

Step-by-step walkthrough for demoing the wager escrow app on devnet.

## Prerequisites
- App running at `$APP_URL` (local or Vercel)
- PostgreSQL database connected
- Phantom or Solflare wallet set to devnet
- Two wallets with devnet SOL (maker + taker)

## 1. Create a Wager (Maker)

1. Open `$APP_URL/create`
2. Enter wager text:
   > "Bitcoin will be above $120,000 on CoinGecko on August 1, 2026"
3. Click **Analyze Wager**
4. Review the AI-normalized condition:
   - YES: BTC >= $120,000 on CoinGecko at Aug 1, 2026 00:00 UTC
   - NO: BTC < $120,000
   - Ambiguity score: low (objective, verifiable)
5. Enter maker wallet pubkey
6. Set stake to **0.1 SOL**
7. Choose side: **YES**
8. Click **Confirm & Create Bet**

**What to explain**: AI converts natural language into precise YES/NO with objective criteria, resolution sources, and ambiguity scoring. Subjective bets are rejected.

## 2. Fund the Escrow (Maker)

1. Navigate to the bet detail page (`/bet/{id}`)
2. The `fund_maker` transaction is built by the backend
3. Maker signs in their wallet
4. 0.1 SOL transfers to the PDA vault (non-custodial)
5. Verify on Solana Explorer: vault PDA balance = 0.1 SOL

**What to explain**: Funds are held in a Program Derived Address (PDA), not a platform wallet. The program owns the vault, not any human.

## 3. Share the Blink Link (Maker → Taker)

1. Copy the Blink URL from the bet detail page
2. Send it to the counterparty (Discord, Twitter, iMessage, etc.)
3. Show the URL structure: `/api/actions/bet/{id}`

**What to explain**: Solana Actions/Blinks allow anyone to accept the wager from a single link. No app install needed. Works in any wallet that supports Blinks.

## 4. Accept the Wager (Taker)

1. Taker opens the Blink link
2. Wallet shows wager details:
   - Question, YES/NO definitions, stake, deadline
   - "WARNING: This is experimental devnet software"
3. Taker clicks **Accept (0.1 SOL)**
4. Signs transaction
5. 0.1 SOL transfers to vault, vault now holds 0.2 SOL total
6. Bet status changes to **ACCEPTED**

**What to explain**: The taker deposits matching stake into the same PDA vault. Both sides are now committed. Total pot = 0.2 SOL.

## 5. Wait for Deadline

- In a live demo, set the deadline to 2-3 minutes from now
- Show the bet detail page updating status

## 6. Resolve with AI (Admin)

1. Open `$APP_URL/admin`
2. Enter admin API key
3. Click **Run Resolver**
4. The AI resolver:
   - Gathers evidence from resolution sources
   - Proposes YES, NO, or UNKNOWN
   - Assigns a confidence score
   - Stores evidence hash (SHA-256) on-chain
5. Show the evidence on the bet detail page

**What to explain**: AI resolution is a *proposal*, not a final decision. Evidence is hashed and stored on-chain for verifiability. Low-confidence or conflicting results are flagged for manual review.

## 7. Dispute Window (24 hours)

- Show the dispute deadline on the bet detail page
- Explain that either party can dispute within 24 hours
- If no dispute, the bet auto-finalizes

**What to explain**: The 24-hour dispute window prevents instant irreversible AI payouts. This is a safety mechanism. For the demo, we'll use admin finalize.

## 8. Admin Finalize (or Wait)

1. In the admin panel, find the bet
2. Review evidence and proposed winner
3. Click **Finalize YES** (or NO)
4. Confirm the dialog showing:
   - Total pot: 0.2 SOL
   - Fee (1%): 0.002 SOL
   - Winner payout: 0.198 SOL
5. Transaction executes on-chain

**What to explain**: Admin confirmation shows exact payout amounts. All admin actions are logged with before/after status and evidence hash.

## 9. Verify on Explorer

Show three things on Solana Explorer:

1. **Vault PDA**: Balance = 0 (all funds distributed)
   - `https://explorer.solana.com/address/{vault_pda}?cluster=devnet`

2. **Winner wallet**: Received 0.198 SOL
   - `https://explorer.solana.com/address/{winner}?cluster=devnet`

3. **Fee wallet**: Received 0.002 SOL
   - `https://explorer.solana.com/address/{fee_wallet}?cluster=devnet`

## 10. Show Security (Optional)

- Try accepting an already-accepted bet → fails
- Try finalizing an already-finalized bet → fails
- Try proposing result as non-resolver → fails
- Show evidence hash matches on-chain
- Show admin action log in the database

## Key Talking Points

- **Non-custodial**: PDA escrow, not a platform wallet
- **AI-powered**: Natural language → precise YES/NO conditions
- **Evidence-backed**: SHA-256 evidence hash stored on-chain
- **Dispute protection**: 24-hour dispute window before payout
- **Solana Blinks**: Share a single link, no app install
- **Devnet only**: Experimental software, no real funds
