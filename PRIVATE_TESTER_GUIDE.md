# Private Tester Guide

**WARNING: This is a devnet beta. All SOL is test SOL with zero real-world value. Do not send mainnet SOL.**

## 1. Set Up Your Wallet

### Phantom
1. Install [Phantom](https://phantom.app) browser extension
2. Open Phantom > Settings (gear icon) > Developer Settings
3. Enable **Testnet Mode**
4. Select **Solana Devnet**

### Solflare
1. Install [Solflare](https://solflare.com) browser extension
2. Open Solflare > Settings > Network
3. Select **Devnet**

## 2. Get Devnet SOL

Visit https://faucet.solana.com
- Enter your wallet address
- Select **devnet**
- Click **Confirm Airdrop**
- You should receive 1-2 SOL (test tokens)

If the faucet is rate-limited, try again later or use the CLI: `solana airdrop 1 <YOUR_ADDRESS> --url devnet`

## 3. Create a Wager

1. Open https://wager-smoky.vercel.app/create
2. Describe your bet in plain English, e.g.:
   > "Bitcoin will be above $120,000 on August 1, 2026"
3. Click **Analyze Wager**
4. The AI normalizes your condition into precise YES/NO definitions
5. Review:
   - Is the YES definition clear?
   - Is the NO definition the exact opposite?
   - Is the deadline correct?
   - Is the resolution source reasonable?
6. Enter your wallet pubkey and stake amount (max 10 SOL)
7. Choose your side (YES or NO)
8. Click **Confirm & Create Bet**

## 4. Fund Your Side

After creating, the bet detail page shows your bet in OPEN status.
The on-chain `initialize_bet` and `fund_maker` transactions need to be signed.
Currently this requires CLI tools — wallet adapter integration is in progress.

## 5. Share the Blink

Once funded, copy the Blink URL from the bet detail page.
Share it with your counterparty. They open it in any Blink-compatible wallet.

## 6. Accept a Wager (Taker)

1. Open the Blink URL shared with you
2. Your wallet shows the wager details
3. Click **Accept** and sign the transaction
4. Your matching stake is deposited into the PDA vault

## 7. Resolution

After the deadline:
1. An admin triggers the AI resolver
2. The AI gathers evidence and proposes a winner
3. A 24-hour dispute window opens
4. Either party can dispute if they disagree
5. If no dispute, the bet auto-finalizes after 24h
6. If disputed, an admin reviews and decides

Winner receives 99% of the pot. 1% goes to the platform fee.

## 8. Report Bugs

If the **Report Bug** link is visible in the app header, use it. Otherwise contact the team directly. Include:
- What you did (step by step)
- What happened
- What you expected
- Your wallet pubkey
- The bet URL or ID
- Screenshots if possible

## Important Reminders

- This is **devnet only** — test SOL has no value
- AI resolution is experimental and may be incorrect
- The dispute window exists to catch AI errors
- Maximum stake is 10 SOL (devnet)
- Rate limits: 5 bet creations per minute, 10 normalizations per minute
- Maximum 10 active bets per wallet
