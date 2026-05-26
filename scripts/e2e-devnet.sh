#!/usr/bin/env bash
set -euo pipefail

# End-to-end devnet test script for wager_escrow
# Prerequisites: solana CLI configured to devnet, program deployed,
# PROGRAM_ID set to deployed address

PROGRAM_ID="${WAGER_PROGRAM_ID:-7fQ9Dh4iNrp2mfjtBthqrmrcYZXhSaCVZcyXVuCs6hFN}"

echo "=== Wager Escrow E2E Devnet Test ==="
echo "Program ID: $PROGRAM_ID"
echo ""

solana config set --url devnet

echo "1. Creating maker wallet..."
MAKER_KEYPAIR=$(mktemp)
solana-keygen new --no-bip39-passphrase --force -o "$MAKER_KEYPAIR" 2>/dev/null
MAKER=$(solana-keygen pubkey "$MAKER_KEYPAIR")
echo "   Maker: $MAKER"

echo "2. Creating taker wallet..."
TAKER_KEYPAIR=$(mktemp)
solana-keygen new --no-bip39-passphrase --force -o "$TAKER_KEYPAIR" 2>/dev/null
TAKER=$(solana-keygen pubkey "$TAKER_KEYPAIR")
echo "   Taker: $TAKER"

echo "3. Creating resolver wallet..."
RESOLVER_KEYPAIR=$(mktemp)
solana-keygen new --no-bip39-passphrase --force -o "$RESOLVER_KEYPAIR" 2>/dev/null
RESOLVER=$(solana-keygen pubkey "$RESOLVER_KEYPAIR")
echo "   Resolver: $RESOLVER"

echo "4. Creating fee wallet..."
FEE_KEYPAIR=$(mktemp)
solana-keygen new --no-bip39-passphrase --force -o "$FEE_KEYPAIR" 2>/dev/null
FEE_WALLET=$(solana-keygen pubkey "$FEE_KEYPAIR")
echo "   Fee Wallet: $FEE_WALLET"

echo "5. Requesting airdrops..."
solana airdrop 2 "$MAKER" --keypair "$MAKER_KEYPAIR" || echo "   Airdrop may take a moment..."
sleep 2
solana airdrop 2 "$TAKER" --keypair "$TAKER_KEYPAIR" || echo "   Airdrop may take a moment..."
sleep 2
solana airdrop 1 "$RESOLVER" --keypair "$RESOLVER_KEYPAIR" || echo "   Airdrop may take a moment..."
sleep 2

echo ""
echo "6. Checking balances..."
echo "   Maker:    $(solana balance "$MAKER") SOL"
echo "   Taker:    $(solana balance "$TAKER") SOL"
echo "   Resolver: $(solana balance "$RESOLVER") SOL"

echo ""
echo "=== E2E wallet setup complete ==="
echo ""
echo "Next steps (require deployed program and anchor test framework):"
echo "  - Create bet (initialize_bet)"
echo "  - Fund maker (fund_maker)"
echo "  - Accept bet (accept_bet)"
echo "  - Wait for deadline"
echo "  - Propose result (propose_result)"
echo "  - Wait or dispute"
echo "  - Finalize (finalize_result_after_dispute_window or admin_finalize_disputed)"
echo "  - Verify balances"
echo ""
echo "Run the full on-chain flow with: anchor test --skip-build --provider.cluster devnet"

# Cleanup
rm -f "$MAKER_KEYPAIR" "$TAKER_KEYPAIR" "$RESOLVER_KEYPAIR" "$FEE_KEYPAIR"
