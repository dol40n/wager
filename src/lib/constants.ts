import { PublicKey } from "@solana/web3.js";

export const SOLANA_RPC_URL =
  process.env.NEXT_PUBLIC_SOLANA_RPC_URL || "https://api.devnet.solana.com";

export const SOLANA_NETWORK = (process.env.NEXT_PUBLIC_SOLANA_NETWORK ||
  "devnet") as "devnet" | "mainnet-beta";

export const PROGRAM_ID = new PublicKey(
  process.env.WAGER_PROGRAM_ID ||
    "7fQ9Dh4iNrp2mfjtBthqrmrcYZXhSaCVZcyXVuCs6hFN"
);

export const FEE_WALLET = new PublicKey(
  process.env.FEE_WALLET ||
    "11111111111111111111111111111111"
);

export const APP_URL =
  process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000";

export const MAX_STAKE_SOL = 10;
export const MAX_STAKE_LAMPORTS = MAX_STAKE_SOL * 1_000_000_000;
export const DEFAULT_FEE_BPS = 100; // 1%
export const DISPUTE_WINDOW_SECONDS = 86_400; // 24 hours
export const REFUND_TIMEOUT_SECONDS = 7 * 86_400; // 7 days

export const ADMIN_API_KEY = process.env.ADMIN_API_KEY || "";
