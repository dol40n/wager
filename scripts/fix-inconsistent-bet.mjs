import pkg from "@coral-xyz/anchor";
const { AnchorProvider, Program, Wallet, BN } = pkg;
import { Keypair, PublicKey, SystemProgram, LAMPORTS_PER_SOL, Connection } from "@solana/web3.js";
import { createHash } from "crypto";
import { readFileSync } from "fs";
import { homedir } from "os";
import { createRequire } from "module";

const require = createRequire(import.meta.url);
const IDL = require("../target/idl/wager_escrow.json");

const BET_DB_ID = "cmpm6on7q000310jibwnf6syj";
const BET_HASH = "5bc4779e2d33a56694ea33eea0d9051242d99e306315533552942bf723b35fa6";
const TAKER_PUBKEY = "FxJFH99Ddnq2ugtHUBY7t5HQ6BkXXPjL6ecQPjgpJzow";
const FEE_WALLET = new PublicKey("EeVikWJhvRtPC7WG5UsXVy6Uf8ZKFEeadeJDqvBhg22p");

const connection = new Connection("https://api.devnet.solana.com", "confirmed");
const walletKeypair = Keypair.fromSecretKey(
  Uint8Array.from(JSON.parse(readFileSync(homedir() + "/.config/solana/id.json", "utf8")))
);
const wallet = new Wallet(walletKeypair);
const provider = new AnchorProvider(connection, wallet, { commitment: "confirmed" });
pkg.setProvider(provider);

const program = new Program(IDL, provider);
const programId = program.programId;

const betIdHash = Buffer.from(BET_HASH, "hex");
const [betPDA] = PublicKey.findProgramAddressSync([Buffer.from("bet"), betIdHash], programId);
const [vaultPDA] = PublicKey.findProgramAddressSync([Buffer.from("vault"), betPDA.toBuffer()], programId);

console.log("=== Fix Inconsistent Bet ===");
console.log(`Bet PDA: ${betPDA.toBase58()}`);
console.log(`Vault:   ${vaultPDA.toBase58()}`);
console.log(`Vault balance: ${(await connection.getBalance(vaultPDA)) / LAMPORTS_PER_SOL} SOL`);

// Read on-chain bet
const betAccount = await program.account.betAccount.fetch(betPDA);
console.log(`On-chain status: ${JSON.stringify(betAccount.status)}`);
console.log(`Resolver authority: ${betAccount.resolverAuthority.toBase58()}`);
console.log(`Maker: ${betAccount.maker.toBase58()}`);
console.log(`Taker: ${betAccount.taker?.toBase58()}`);

// The on-chain status is ACCEPTED. We need to:
// 1. propose_result (resolver signs) — but we don't have the resolver keypair locally
// Instead, let's sync the DB back to DISPUTED and call finalize-onchain via the hosted API.
// Wait — finalize-onchain calls admin_finalize_disputed which requires on-chain status == DISPUTED.
// We need the resolver to first propose_result and dispute on-chain.

// The resolver keypair is only on Vercel. Let's call the hosted API to do this.
console.log("\nThis bet needs propose_result + dispute_result on-chain before finalize.");
console.log("The resolver keypair is only on the hosted backend.");
console.log("Use the hosted finalize-onchain endpoint which has the resolver key.");

// First sync the DB status back to DISPUTED so finalize-onchain can proceed
console.log("\nTo fix:");
console.log("1. Sync DB to DISPUTED: POST /api/bets/:id/sync { status: 'DISPUTED' }");
console.log("2. But on-chain is ACCEPTED, not DISPUTED");
console.log("3. Need propose_result + dispute_result on-chain first");
console.log("4. These require the resolver authority keypair (on Vercel)");
console.log("\nSolution: add a propose-and-dispute-onchain API endpoint,");
console.log("or create a fresh bet and test finalize-onchain with it.");
