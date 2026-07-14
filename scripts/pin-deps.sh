#!/usr/bin/env bash
set -euo pipefail

# Generate fresh lockfile with Cargo 1.79 (produces v3 format)
rm -f Cargo.lock
cargo +1.79.0 generate-lockfile

# Use stable Cargo to downgrade crates that require edition2024 or Rust 1.85+
# (stable Cargo can parse them; 1.75 BPF Cargo cannot)
cargo +stable update blake3 --precise 1.5.5
cargo +stable update proc-macro-crate@3.5.0 --precise 3.2.0 2>/dev/null || true
cargo +stable update borsh@1.6.1 --precise 1.5.3 2>/dev/null || true
cargo +stable update indexmap@2.14.0 --precise 2.7.1 2>/dev/null || true
cargo +stable update unicode-segmentation@1.13.2 --precise 1.12.0 2>/dev/null || true

# Downgrade lockfile format from v4 (written by stable Cargo) back to v3
# (required by the Solana BPF toolchain's Cargo 1.75)
if head -3 Cargo.lock | grep -q 'version = 4'; then
  # `sed -i.bak` works with both BSD sed (macOS) and GNU sed (CI).
  sed -i.bak 's/^version = 4$/version = 3/' Cargo.lock
  rm -f Cargo.lock.bak
  echo "Lockfile downgraded from v4 to v3"
fi

echo "Done. Cargo.lock is ready for anchor build."
