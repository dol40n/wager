FROM --platform=linux/amd64 rust:1.79-slim AS builder

RUN apt-get update && apt-get install -y \
    curl build-essential pkg-config libudev-dev libssl-dev \
    && rm -rf /var/lib/apt/lists/*

RUN sh -c "$(curl -sSfL https://release.anza.xyz/v1.18.26/install)" \
    && export PATH="/root/.local/share/solana/install/active_release/bin:$PATH" \
    && solana --version

RUN cargo install --git https://github.com/coral-xyz/anchor avm --tag v0.30.1 --locked \
    && avm install 0.30.1 && avm use 0.30.1

RUN curl -fsSL https://deb.nodesource.com/setup_22.x | bash - \
    && apt-get install -y nodejs \
    && npm install -g npm@10.9.3

ENV PATH="/root/.avm/bin:/root/.local/share/solana/install/active_release/bin:${PATH}"

WORKDIR /wager

COPY Cargo.toml Cargo.lock Anchor.toml ./
COPY programs/ programs/

RUN cargo-build-sbf --manifest-path programs/wager_escrow/Cargo.toml \
    --sbf-out-dir target/deploy -- --locked

COPY package.json package-lock.json tsconfig.anchor.json ./
RUN npm ci

COPY . .
RUN npm run generate:idl

CMD ["sh", "-c", "mkdir -p /root/.config/solana && solana-keygen new --no-bip39-passphrase --silent --force --outfile /root/.config/solana/id.json && anchor test --skip-build"]
