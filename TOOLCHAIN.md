# Toolchain and IDL Generation

Wager pins an older Solana/Anchor stack to keep the deployed devnet program and
its test environment repeatable with the documented dependency graph. CI and
the Docker test image pin the web tooling to Node.js 22.

## Pinned versions

| Tool | Version | Purpose |
|---|---:|---|
| Node.js | 22.x | Next.js, Prisma, Vitest and IDL tooling |
| npm | 10.x | Lockfile-based installation |
| Solana CLI | 1.18.26 | Program build and local validator |
| Anchor CLI / `anchor-lang` | 0.30.1 | Program client and framework |
| Rust host toolchain | stable | Cargo metadata and host-side tooling |
| Rust lockfile toolchain | 1.79.0 | Compatible lockfile generation |
| Solana BPF Rust | 1.75.0 | Bundled by platform-tools v1.41 |

Use newer versions only as a deliberate upgrade. The constraints below apply
to the currently pinned dependency graph; they are not a claim that every
future Anchor/Solana combination is incompatible.

## Why the IDL is generated separately

The current Anchor 0.30.1 dependency combination cannot complete its normal IDL
generation path with the resolved `proc-macro2` versions in this repository.
The project therefore keeps IDL generation explicit instead of presenting the
normal Anchor command as reproducible for this pinned graph.

`scripts/generate-idl.mjs` is the repository workaround. It:

- computes instruction discriminators as
  `sha256("global:<instruction_name>")[0..8]`;
- computes account discriminators as
  `sha256("account:<AccountName>")[0..8]`;
- writes a stable IDL from a manually maintained description of account order,
  field layout, enums and errors.

The layout is not automatically extracted from Rust. Changes to an instruction,
account or error require updating both the Rust source and generator. The
IDL-verification tests compare the generated file with a second manually
maintained expectation and read the program ID from Rust; they do not prove that
the complete Rust ABI and IDL are synchronized. `target/idl/wager_escrow.json`
is intentionally tracked because the application and tests consume it.

`target/deploy/wager_escrow.so` is also tracked as a bankrun test fixture so
`npm test` works without requiring every web contributor to install the Solana
toolchain. It is a generated binary, not a release artifact or proof that the
deployed devnet program matches current source. Program changes must rebuild it
and review the binary diff together with the Rust and bankrun tests.

## Dependency pinning

The Solana 1.18 BPF toolchain bundles a Cargo version that cannot parse Rust
2024 manifests. Transitive packages can therefore make a previously valid
program fail before compilation.

`scripts/pin-deps.sh` regenerates and adjusts `Cargo.lock` for this pinned stack:

1. generate the lockfile with Rust 1.79;
2. use stable Cargo to pin `blake3` and best-effort compatible versions of
   `proc-macro-crate`, `borsh`, `indexmap` and `unicode-segmentation`;
3. write lockfile format 3 for the BPF Cargo toolchain.

The script rewrites `Cargo.lock`. Run it intentionally and review the resulting
diff rather than treating it as a harmless pre-test command. It resolves the
latest compatible transitive versions available at refresh time, so CI does not
run it. CI and the Docker image build the committed graph with `--locked` and
verify that the resulting bankrun fixture matches the tracked `.so`.

## Web application setup

```bash
npm ci
cp .env.example .env
npm run db:generate
npm run db:push
npm run dev
```

The project currently uses `prisma db push`; there is no committed production
migration history.

## Program build

One-time tool installation:

```bash
rustup install stable
rustup install 1.79.0
sh -c "$(curl -sSfL https://release.anza.xyz/v1.18.26/install)"
cargo install --git https://github.com/coral-xyz/anchor avm --tag v0.30.1 --locked
avm install 0.30.1
avm use 0.30.1
export PATH="$HOME/.local/share/solana/install/active_release/bin:$HOME/.avm/bin:$PATH"
solana-keygen new --no-bip39-passphrase --force
```

Build and regenerate the IDL:

```bash
bash scripts/pin-deps.sh
cargo-build-sbf \
  --manifest-path programs/wager_escrow/Cargo.toml \
  --sbf-out-dir target/deploy -- --locked
npm run generate:idl
git diff --exit-code -- target/idl/wager_escrow.json
```

## Test suites

Web/backend and bankrun tests:

```bash
npm run typecheck
npm run lint
npm test
npm run build
```

Anchor local-validator tests:

```bash
COPYFILE_DISABLE=1 anchor test --skip-build
```

`COPYFILE_DISABLE=1` prevents macOS AppleDouble metadata from entering the
local-validator genesis archive; it is harmless on Linux.

The default Anchor command is limited to the localnet Mocha suites. The devnet
smoke test is deliberately separate because it submits network transactions:

```bash
export ANCHOR_WALLET="$HOME/.config/solana/id.json"
anchor run test-devnet --provider.cluster devnet
```

See [`docs/DEVNET_VALIDATION.md`](docs/DEVNET_VALIDATION.md) before running it.

## Docker test image

The root `Dockerfile` is a reference Anchor build/test environment, not the
production Next.js application image. It generates the IDL during the build and
creates a disposable local-validator wallet when the container starts:

```bash
docker build -t wager-anchor-tests .
docker run --rm wager-anchor-tests
```

Vercel builds the web application separately using `vercel.json`.
