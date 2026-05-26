import pkg from "@coral-xyz/anchor";
const { AnchorProvider, Program, Wallet, BN, web3 } = pkg;
import { Keypair, PublicKey, SystemProgram, LAMPORTS_PER_SOL, Connection } from "@solana/web3.js";
import { createHash } from "crypto";
import { readFileSync } from "fs";
import { homedir } from "os";
import { createRequire } from "module";

const require = createRequire(import.meta.url);
const IDL = require("../target/idl/wager_escrow.json");

const APP_URL = "https://wager-smoky.vercel.app";
const ADMIN_KEY = "wager-devnet-admin-2026";
const STAKE = 0.05 * LAMPORTS_PER_SOL;
const FEE_BPS = 100;

const connection = new Connection("https://api.devnet.solana.com", "confirmed");
const walletKeypair = Keypair.fromSecretKey(
  Uint8Array.from(JSON.parse(readFileSync(homedir() + "/.config/solana/id.json", "utf8")))
);
const wallet = new Wallet(walletKeypair);
const provider = new AnchorProvider(connection, wallet, { commitment: "confirmed" });
pkg.setProvider(provider);

const program = new Program(IDL, provider);
const programId = program.programId;

const maker = walletKeypair;
const taker = Keypair.generate();
const feeWallet = new PublicKey("EeVikWJhvRtPC7WG5UsXVy6Uf8ZKFEeadeJDqvBhg22p");

const healthRes = await fetch(`${APP_URL}/api/health`);
const health = await healthRes.json();
const resolverAuthority = new PublicKey(health.resolver_authority);

console.log("=== Hosted E2E Wallet Flow ===");
console.log(`Program:  ${programId.toBase58()}`);
console.log(`Resolver: ${resolverAuthority.toBase58()}`);
console.log(`Maker:    ${maker.publicKey.toBase58()}`);
console.log(`Taker:    ${taker.publicKey.toBase58()}`);
console.log(`Balance:  ${(await connection.getBalance(maker.publicKey)) / LAMPORTS_PER_SOL} SOL`);
console.log("");

// Step 0: Create bet in hosted DB with short deadline
console.log("=== Step 0: Create bet in hosted DB ===");
const shortDeadline = new Date(Date.now() + 20_000).toISOString();
const createRes = await fetch(`${APP_URL}/api/bets/create`, {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({
    original_text: "Hosted E2E test — will this flow complete?",
    normalized_question: "Will this hosted E2E test complete successfully?",
    category: "custom",
    yes_definition: "The E2E test completes all steps",
    no_definition: "The E2E test does not complete all steps",
    deadline_utc: shortDeadline,
    resolution_sources: ["E2E test runner"],
    resolution_method: "manual_review",
    objective_criteria: ["All steps pass"],
    ambiguity_score: 0,
    ambiguity_notes: [],
    maker_side: "YES",
    stake_lamports: STAKE,
    maker_pubkey: maker.publicKey.toBase58(),
  }),
});
const created = await createRes.json();
const BET_DB_ID = created.id;
const betIdHash = Buffer.from(created.betIdHash, "hex");
console.log(`DB ID:    ${BET_DB_ID}`);
console.log(`Hash:     ${created.betIdHash}`);
console.log(`Deadline: ${shortDeadline}`);

const [betPDA] = PublicKey.findProgramAddressSync([Buffer.from("bet"), betIdHash], programId);
const [vaultPDA] = PublicKey.findProgramAddressSync([Buffer.from("vault"), betPDA.toBuffer()], programId);
console.log(`Bet PDA:  ${betPDA.toBase58()}`);
console.log(`Vault:    ${vaultPDA.toBase58()}`);

// Step 1: Initialize on-chain
console.log("\n=== Step 1: initialize_bet ===");
const deadlineTs = Math.floor(Date.now() / 1000) + 20;
const sig1 = await program.methods
  .initializeBet(Array.from(betIdHash), { yes: {} }, new BN(STAKE), new BN(deadlineTs), FEE_BPS, null)
  .accounts({ bet: betPDA, vault: vaultPDA, maker: maker.publicKey, resolverAuthority, systemProgram: SystemProgram.programId })
  .signers([maker])
  .rpc();
console.log(`TX: ${sig1}`);

// Step 2: Fund maker
console.log("\n=== Step 2: fund_maker ===");
const sig2 = await program.methods.fundMaker()
  .accounts({ bet: betPDA, vault: vaultPDA, maker: maker.publicKey, systemProgram: SystemProgram.programId })
  .signers([maker]).rpc();
console.log(`TX: ${sig2}`);
console.log(`Vault: ${(await connection.getBalance(vaultPDA)) / LAMPORTS_PER_SOL} SOL`);

// Step 3: Fund taker, accept
console.log("\n=== Step 3: accept_bet ===");
const fundTx = new web3.Transaction().add(
  SystemProgram.transfer({ fromPubkey: maker.publicKey, toPubkey: taker.publicKey, lamports: 0.1 * LAMPORTS_PER_SOL })
);
await provider.sendAndConfirm(fundTx);
const sig3 = await program.methods.acceptBet()
  .accounts({ bet: betPDA, vault: vaultPDA, taker: taker.publicKey, systemProgram: SystemProgram.programId })
  .signers([taker]).rpc();
console.log(`TX: ${sig3}`);
console.log(`Vault: ${(await connection.getBalance(vaultPDA)) / LAMPORTS_PER_SOL} SOL`);

let betOnChain = await program.account.betAccount.fetch(betPDA);
console.log(`On-chain status: ${JSON.stringify(betOnChain.status)}`);

// Step 4: Wait
console.log("\n=== Step 4: Wait for deadline (20s) ===");
await new Promise(r => setTimeout(r, 21_000));

// Step 5: Hosted resolver
console.log("\n=== Step 5: Run hosted resolver ===");
const resolveRes = await fetch(`${APP_URL}/api/resolver/run/${BET_DB_ID}`, {
  method: "POST",
  headers: { "x-admin-api-key": ADMIN_KEY },
});
const resolveData = await resolveRes.json();
console.log(`Status: ${resolveRes.status}`);
if (resolveData.error) {
  console.log(`Error: ${resolveData.error}`);
} else {
  console.log(`Winner: ${resolveData.winner_side}`);
  console.log(`Confidence: ${resolveData.confidence}`);
  console.log(`Manual review: ${resolveData.needs_manual_review}`);
  console.log(`Evidence count: ${resolveData.evidence?.length}`);
}

const betAfterResolve = await (await fetch(`${APP_URL}/api/bets/${BET_DB_ID}`)).json();
console.log(`DB status: ${betAfterResolve.status}`);
console.log(`DB evidence hash: ${betAfterResolve.evidenceHash}`);

// Step 6: Admin finalize
console.log("\n=== Step 6: Admin finalize ===");
const winnerSide = betAfterResolve.proposedWinner || "YES";
const finalizeRes = await fetch(`${APP_URL}/api/admin/bets/${BET_DB_ID}/finalize`, {
  method: "POST",
  headers: { "Content-Type": "application/json", "x-admin-api-key": ADMIN_KEY },
  body: JSON.stringify({ winner_side: winnerSide, confirmation: "FINALIZE" }),
});
const finalizeData = await finalizeRes.json();
console.log(`Result: ${JSON.stringify(finalizeData)}`);

// Step 7: Final verification
console.log("\n=== Step 7: Final verification ===");
const betFinal = await (await fetch(`${APP_URL}/api/bets/${BET_DB_ID}`)).json();
betOnChain = await program.account.betAccount.fetch(betPDA);
const vaultFinal = await connection.getBalance(vaultPDA);

console.log(`DB status:        ${betFinal.status}`);
console.log(`DB final winner:  ${betFinal.finalWinner}`);
console.log(`DB evidence hash: ${betFinal.evidenceHash}`);
console.log(`On-chain status:  ${JSON.stringify(betOnChain.status)}`);
console.log(`Vault balance:    ${vaultFinal / LAMPORTS_PER_SOL} SOL`);

console.log("\n========================================");
console.log("  TRANSACTION SIGNATURES");
console.log("========================================");
console.log(`init:   https://explorer.solana.com/tx/${sig1}?cluster=devnet`);
console.log(`fund:   https://explorer.solana.com/tx/${sig2}?cluster=devnet`);
console.log(`accept: https://explorer.solana.com/tx/${sig3}?cluster=devnet`);
console.log(`\nBet page: ${APP_URL}/bet/${BET_DB_ID}`);
