# Private Beta Guide

## Disclaimer

**This is experimental devnet software.** Do not use real funds. AI resolution is not guaranteed to be correct. The platform is not audited. Use at your own risk.

## Quick Start for Beta Testers

### 1. Setup a Solana Wallet
- Install [Phantom](https://phantom.app) or [Solflare](https://solflare.com)
- Switch network to **Devnet** in wallet settings
- Get devnet SOL from https://faucet.solana.com

### 2. Create a Wager
1. Visit the app at the provided URL
2. Click "Create a Wager"
3. Describe your bet in natural language (e.g., "Bitcoin will be above $100k on July 1, 2026")
4. Review the AI-normalized YES/NO conditions
5. Enter your wallet pubkey and stake amount
6. Click "Confirm & Create Bet"
7. Sign the `initialize_bet` + `fund_maker` transactions in your wallet

### 3. Share with Counterparty
- Copy the Blink URL from the bet detail page
- Send it to your counterparty
- They open the link, connect wallet, and sign the `accept_bet` transaction

### 4. Wait for Resolution
- After the deadline, an admin triggers the AI resolver
- The resolver proposes a winner with evidence
- A 24-hour dispute window opens
- If no dispute, the bet auto-finalizes
- If disputed, an admin reviews and decides

## Blink Wallet Preview States

| Bet State | Wallet Shows | Button |
|-----------|-------------|--------|
| OPEN + funded + before deadline | Wager details + stake amount | "Accept (X SOL)" |
| OPEN + not funded | Wager details | "Awaiting maker funding" (disabled) |
| ACCEPTED | Wager details | "Bet accepted" (disabled) |
| Deadline passed | Wager details | "Deadline passed" (disabled) |
| Wrong allowed_taker | Transaction error | Wallet rejects tx |

## Known Risks

1. **AI resolution is imperfect.** The resolver may propose incorrect winners for subjective or ambiguous wagers. This is why the dispute window and admin review exist.
2. **No oracle integration.** The AI resolver uses its training data and web knowledge, not real-time API feeds. For crypto price bets, actual API integration is planned but not yet implemented.
3. **Single resolver authority.** The resolver is a backend-controlled keypair, not a DAO or decentralized oracle. The admin can override any result.
4. **No wallet adapter.** The frontend currently requires manual pubkey entry. Wallet adapter integration is planned.
5. **DB/chain sync is manual.** On-chain state and database state are updated separately. If a transaction succeeds on-chain but the API call fails, state may diverge.
6. **24h dispute window is fixed.** Cannot be shortened per-bet. For testing, use the admin finalize to bypass.
7. **Rate limits.** Bet creation is limited to 5/minute per IP. Normalize is limited to 10/minute per IP. Max 10 active bets per wallet.

## Test Scenarios

### Happy Path
1. Create wager with clear, objective condition
2. Fund maker side
3. Share Blink, taker accepts
4. Wait for deadline
5. Admin runs resolver
6. No dispute → auto-finalize after 24h (or admin finalize)
7. Winner receives 99%, fee wallet receives 1%

### Dispute Path
1. Same as above through step 5
2. Loser disputes within 24h
3. Admin reviews evidence
4. Admin finalizes with correct winner or refunds both

### Cancel Path
1. Create and fund a wager
2. No taker accepts
3. Maker cancels
4. Maker receives full refund

### Edge Cases to Test
- Wager with ambiguity score > 0.25 (should show warning)
- Wager that AI rejects (illegal/subjective)
- Accepting a bet after deadline (should fail)
- Accepting a bet as wrong allowed_taker (should fail)
- Creating > 10 active bets (should fail)
- Stake > 10 SOL (should fail)
- Stake = 0 (should fail)

## Environment Variables

```bash
# Required
DATABASE_URL="postgresql://..."
ANTHROPIC_API_KEY="sk-ant-..."
ADMIN_API_KEY="your-admin-secret"
WAGER_PROGRAM_ID="7fQ9Dh4iNrp2mfjtBthqrmrcYZXhSaCVZcyXVuCs6hFN"
RESOLVER_AUTHORITY_PRIVATE_KEY="base58-encoded-keypair"
FEE_WALLET="your-fee-wallet-pubkey"

# Optional
NEXT_PUBLIC_SOLANA_RPC_URL="https://api.devnet.solana.com"
NEXT_PUBLIC_SOLANA_NETWORK="devnet"
NEXT_PUBLIC_APP_URL="https://your-app.vercel.app"
```

## Deployment (Vercel)

```bash
# 1. Push to GitHub
git remote add origin git@github.com:your-org/wager.git
git push -u origin master

# 2. Import to Vercel
# - Connect GitHub repo
# - Set environment variables (see above)
# - Framework: Next.js
# - Build command: npx prisma generate && npm run build
# - Output directory: .next

# 3. Database
# - Use Neon, Supabase, or Railway for managed PostgreSQL
# - Set DATABASE_URL in Vercel env vars
# - Run: npx prisma db push

# 4. RPC Provider
# - Default: https://api.devnet.solana.com (rate limited)
# - Recommended: Helius, QuickNode, or Alchemy devnet RPC
# - Set NEXT_PUBLIC_SOLANA_RPC_URL in Vercel env vars
```

## Monitoring

- **Logs**: Vercel function logs show all `[resolver]` and `[admin]` events
- **Database**: Use `npx prisma studio` for DB inspection
- **On-chain**: Use Solana Explorer with `?cluster=devnet`
- **Alerts**: Set up Vercel log drains for error monitoring

## Emergency Pause

If something goes wrong:

1. **Stop the resolver**: Remove `ADMIN_API_KEY` from env vars (blocks all admin/resolver endpoints)
2. **Disable new bets**: Set `MAX_ACTIVE_BETS_PER_WALLET=0` in constants
3. **Refund all active bets**: Use admin refund endpoint for each bet
4. **On-chain refund**: Call `refund_if_expired_or_unresolved` after the 7-day timeout

## Bug Reports

Use the **Report Bug** link in the app header (if configured), or contact the team directly. Include:
- **What happened**: exact steps to reproduce
- **What you expected**: correct behavior
- **Wallet**: your pubkey (devnet only)
- **Bet ID**: from the URL
- **Transaction signature**: from wallet history
- **Screenshots**: wallet preview, error messages

## Not Included in Private Beta

- Wallet adapter integration (manual pubkey for now)
- Real-time API resolution sources (AI knowledge only)
- Mainnet deployment
- Mobile-optimized UI
- Email/push notifications
- Multi-language support
- Automated dispute resolution
- Decentralized oracle integration
