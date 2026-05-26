# Toolchain & IDL Generation

## Pinned Versions

| Tool | Version | Why |
|------|---------|-----|
| Rust (host) | stable (1.85+) | Required for `cargo metadata` — parses edition2024 crate manifests |
| Rust (BPF) | 1.75.0 | Bundled by Solana platform-tools v1.41; cannot parse edition2024 |
| Solana CLI | 1.18.26 | Last 1.x release; platform-tools v1.41 BPF toolchain |
| Anchor CLI | 0.30.1 | Matches anchor-lang crate version |
| anchor-lang | 0.30.1 | Last version compatible with solana-program 1.18.x |
| Node.js | 22.x | LTS |
| npm | 10.x | Ships with Node 22 |

## Why Deterministic IDL Generation

Anchor 0.30.1's `anchor build` and `anchor idl build` fail during IDL generation because:

1. `anchor-syn 0.30.1` calls `proc_macro2::Span::source_file()` in `src/idl/defined.rs:499`
2. This method was removed from `proc-macro2` starting at version 1.0.80
3. The rest of the dependency tree (via `quote >= 1.0.40`) requires `proc-macro2 >= 1.0.80`
4. These version requirements are mutually exclusive — no valid resolution exists

This is tracked in [anchor#3042](https://github.com/coral-xyz/anchor/issues/3042).

**Upgrading to Anchor 0.31+ is not viable** because:
- Anchor 0.31.1 depends on `solana-program 2.3.0`
- `solana-program 2.3.0` pulls `blake3 1.8.5 → digest 0.11.3 → block-buffer 0.12.0`
- `block-buffer 0.12.0` uses edition2024, which the BPF toolchain's Cargo 1.79 cannot parse
- Even with lockfile pinning, the BPF Cargo re-resolves and downloads the edition2024 crates

**The solution**: `scripts/generate-idl.mjs` computes the IDL deterministically from the Rust source using the same algorithm as Anchor:
- Instruction discriminators: `sha256("global:<instruction_name>")[0..8]`
- Account discriminators: `sha256("account:<AccountName>")[0..8]`
- Account ordering, field layouts, types, and errors are transcribed from the Rust source

**Verification**: 26 tests in `tests/idl-verification.test.ts` verify every discriminator, account order, field layout, enum variant, and error code. 20 on-chain Anchor tests prove the IDL works by calling every instruction through it on `solana-test-validator`.

## Dependency Pinning (edition2024 Workaround)

The Solana BPF toolchain bundles Cargo 1.75, which cannot parse crate manifests using Rust edition 2024 (stabilized in Rust 1.85). As more crates adopt edition2024, transitive deps in the lockfile may resolve to incompatible versions.

`scripts/pin-deps.sh` handles this:
1. Generates `Cargo.lock` with Cargo 1.79 (produces lockfile format v3)
2. Uses stable Cargo to downgrade `blake3` to 1.5.5 (avoids `block-buffer 0.12.0`)
3. Downgrades lockfile version from 4 to 3 (required by BPF Cargo 1.75)

Run this script before `anchor build` or `cargo-build-sbf` if you get `edition2024` errors.

## Build Commands

```bash
# One-time setup
rustup install stable
rustup install 1.79.0
sh -c "$(curl -sSfL https://release.anza.xyz/v1.18.26/install)"
cargo install --git https://github.com/coral-xyz/anchor avm --tag v0.30.1 --locked
avm install 0.30.1 && avm use 0.30.1
rustup default stable  # host Cargo must be 1.85+ for cargo metadata

# Build
bash scripts/pin-deps.sh  # fix lockfile
cargo-build-sbf --manifest-path programs/wager_escrow/Cargo.toml --sbf-out-dir target/deploy
npm run generate:idl

# Test
anchor test --skip-build
npx vitest run
```
