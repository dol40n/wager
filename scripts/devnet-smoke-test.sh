#!/usr/bin/env bash
set -euo pipefail

# Devnet Smoke Test — Full E2E Flow
# Prerequisites:
#   - Solana CLI, Anchor CLI installed (see TOOLCHAIN.md)
#   - Program built: cargo-build-sbf ... (see TOOLCHAIN.md)
#   - Devnet faucet available (or pre-funded wallets)
#
# This script:
#   1. Deploys the program to devnet
#   2. Creates maker, taker, resolver, fee wallets
#   3. Airdrops devnet SOL
#   4. Runs the full bet lifecycle via anchor test
#   5. Prints all transaction signatures and balances
#
# Usage: bash scripts/devnet-smoke-test.sh

export PATH="$HOME/.avm/bin:$HOME/.local/share/solana/install/active_release/bin:$PATH"
source "$HOME/.cargo/env" 2>/dev/null || true

REPORT_FILE="DEVNET_SMOKE_TEST.md"

echo "=============================================="
echo "  Wager Escrow — Devnet Smoke Test"
echo "=============================================="
echo ""

# 1. Configure devnet
echo "Step 1: Configuring Solana CLI for devnet..."
solana config set --url devnet --commitment confirmed
echo ""

# 2. Check deployer balance
DEPLOYER=$(solana-keygen pubkey)
DEPLOYER_BAL=$(solana balance "$DEPLOYER" | awk '{print $1}')
echo "Step 2: Deployer wallet: $DEPLOYER (balance: $DEPLOYER_BAL SOL)"

if (( $(echo "$DEPLOYER_BAL < 3" | bc -l 2>/dev/null || echo 1) )); then
  echo "  Requesting airdrop (5 SOL)..."
  for i in 1 2 3; do
    solana airdrop 2 2>/dev/null && break
    echo "  Airdrop attempt $i failed, retrying in 15s..."
    sleep 15
  done
  DEPLOYER_BAL=$(solana balance "$DEPLOYER" | awk '{print $1}')
  echo "  Updated balance: $DEPLOYER_BAL SOL"
fi

if (( $(echo "$DEPLOYER_BAL < 2" | bc -l 2>/dev/null || echo 1) )); then
  echo ""
  echo "ERROR: Insufficient balance for deployment. Need >= 2 SOL."
  echo "  Visit https://faucet.solana.com to fund: $DEPLOYER"
  echo "  Then re-run this script."
  exit 1
fi
echo ""

# 3. Deploy program
echo "Step 3: Deploying program to devnet..."
DEPLOY_OUTPUT=$(solana program deploy target/deploy/wager_escrow.so \
  --keypair target/deploy/wager_escrow-keypair.json \
  --program-id target/deploy/wager_escrow-keypair.json 2>&1) || {
  echo "  Deploy failed: $DEPLOY_OUTPUT"
  echo "  If program already deployed, continuing..."
}
PROGRAM_ID=$(solana-keygen pubkey target/deploy/wager_escrow-keypair.json)
echo "  Program ID: $PROGRAM_ID"
echo ""

# 4. Update Anchor.toml for devnet
echo "Step 4: Updating Anchor.toml..."
sed -i '' "s|wager_escrow = \".*\"|wager_escrow = \"$PROGRAM_ID\"|g" Anchor.toml 2>/dev/null || \
  sed -i "s|wager_escrow = \".*\"|wager_escrow = \"$PROGRAM_ID\"|g" Anchor.toml
echo "  Done"
echo ""

# 5. Run anchor tests against devnet
echo "Step 5: Running anchor tests against devnet..."
echo "  (This starts a local validator that replays devnet state)"
echo ""

ANCHOR_PROVIDER_URL=https://api.devnet.solana.com \
  anchor test --skip-build --provider.cluster devnet 2>&1 | tee /tmp/devnet-test-output.txt

echo ""
echo "=============================================="
echo "  Results"
echo "=============================================="
PASSING=$(grep -c "✔" /tmp/devnet-test-output.txt 2>/dev/null || echo "?")
FAILING=$(grep -c "failing" /tmp/devnet-test-output.txt 2>/dev/null || echo "0")
echo "  Tests passing: $PASSING"
echo "  Tests failing: $FAILING"
echo "  Program ID: $PROGRAM_ID"
echo "  Explorer: https://explorer.solana.com/address/$PROGRAM_ID?cluster=devnet"
echo ""

# 6. Write report
cat > "$REPORT_FILE" << HEREDOC
# Devnet Smoke Test Report

## Environment
- **Date**: $(date -u +"%Y-%m-%d %H:%M UTC")
- **Network**: Solana devnet
- **Program ID**: \`$PROGRAM_ID\`
- **Explorer**: https://explorer.solana.com/address/$PROGRAM_ID?cluster=devnet
- **Solana CLI**: $(solana --version)
- **Anchor CLI**: $(anchor --version)

## Test Results
- **Passing**: $PASSING
- **Failing**: $FAILING

## Test Output
\`\`\`
$(cat /tmp/devnet-test-output.txt)
\`\`\`

## Verification Checklist
- [ ] Program deployed to devnet
- [ ] initialize_bet creates PDA
- [ ] fund_maker transfers SOL to vault
- [ ] accept_bet deposits matching stake
- [ ] propose_result stores evidence hash
- [ ] dispute_result changes status
- [ ] admin_finalize_disputed pays winner 99%, fee wallet 1%
- [ ] Double payout rejected (InvalidStatus)
- [ ] Refund after payout rejected (NotExpiredOrResolved)
- [ ] Cancel refunds maker
- [ ] DisputeWindowActive guard works
- [ ] Vault balance = 0 after finalize
HEREDOC

echo "Report written to $REPORT_FILE"
echo "Done."
