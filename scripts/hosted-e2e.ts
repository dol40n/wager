import * as anchor from "@coral-xyz/anchor";
import { Program } from "@coral-xyz/anchor";
import {
  Keypair, PublicKey, SystemProgram, LAMPORTS_PER_SOL, Connection,
} from "@solana/web3.js";
import { createHash } from "crypto";
import * as fs from "fs";
import * as os from "os";

const IDL = require("../target/idl/wager_escrow.json");

const APP_URL = "https://wager-smoky.vercel.app";
const ADMIN_KEY = "wager-devnet-admin-2026";
const STAKE = 0.05 * LAMPORTS_PER_SOL;
const FEE_BPS = 100;

async function main() {
  const connection = new Connection("https://api.devnet.solana.com", "confirmed");
  const walletKeypair = Keypair.fromSecretKey(
    Uint8Array.from(JSON.parse(fs.readFileSync(
      os.homedir() + "/.config/solana/id.json", "utf8"
    )))
  );
  const wallet = new anchor.Wallet(walletKeypair);
  const provider = new anchor.AnchorProvider(connection, wallet, { commitment: "confirmed" });
  anchor.setProvider(provider);

  const program = new Program(IDL, provider);
  const programId = program.programId;

  const maker = walletKeypair;
  const taker = Keypair.generate();
  const feeWallet = new PublicKey("EeVikWJhvRtPC7WG5UsXVy6Uf8ZKFEeadeJDqvBhg22p");

  const healthRes = await fetch(`${APP_URL}/api/health`);
  const health = await healthRes.json();
  const resolverAuthority = new PublicKey(health.resolver_authority);

  console.log("=== Hosted E2E Wallet Flow ===");
  console.log(`Program: ${programId.toBase58()}`);
  console.log(`Resolver: ${resolverAuthority.toBase58()}`);
  console.log(`Maker: ${maker.publicKey.toBase58()}`);
  console.log(`Taker: ${taker.publicKey.toBase58()}`);
  console.log(`Maker balance: ${(await connection.getBalance(maker.publicKey)) / LAMPORTS_PER_SOL} SOL`);
  console.log("");

  // Step 0: Create bet in hosted DB with short deadline
  console.log("=== Step 0: Create bet in hosted DB ===");
  const shortDeadline = new Date(Date.now() + 15_000).toISOString(); // 15s from now
  const createRes = await fetch(`${APP_URL}/api/bets/create`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      original_text: "Hosted E2E test bet",
      normalized_question: "Will this E2E test pass?",
      category: "custom",
      yes_definition: "The E2E test completes successfully",
      no_definition: "The E2E test does not complete successfully",
      deadline_utc: shortDeadline,
      resolution_sources: ["E2E test runner"],
      resolution_method: "manual_review",
      objective_criteria: ["Test passes"],
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
  console.log(`DB bet ID: ${BET_DB_ID}`);
  console.log(`Bet hash: ${created.betIdHash}`);
  console.log(`Deadline: ${shortDeadline}`);

  const [betPDA] = PublicKey.findProgramAddressSync([Buffer.from("bet"), betIdHash], programId);
  const [vaultPDA] = PublicKey.findProgramAddressSync([Buffer.from("vault"), betPDA.toBuffer()], programId);
  console.log(`Bet PDA: ${betPDA.toBase58()}`);
  console.log(`Vault PDA: ${vaultPDA.toBase58()}`);

  // Step 1: Initialize on-chain
  console.log("\n=== Step 1: initialize_bet ===");
  const deadlineTs = Math.floor(Date.now() / 1000) + 15;
  const sig1 = await program.methods
    .initializeBet(
      Array.from(betIdHash), { yes: {} }, new anchor.BN(STAKE),
      new anchor.BN(deadlineTs), FEE_BPS, null
    )
    .accounts({
      bet: betPDA, vault: vaultPDA, maker: maker.publicKey,
      resolverAuthority, systemProgram: SystemProgram.programId,
    })
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

  // Step 3: Fund taker, then accept
  console.log("\n=== Step 3: accept_bet ===");
  const fundTx = new anchor.web3.Transaction().add(
    SystemProgram.transfer({ fromPubkey: maker.publicKey, toPubkey: taker.publicKey, lamports: 0.1 * LAMPORTS_PER_SOL })
  );
  await provider.sendAndConfirm(fundTx);

  const sig3 = await program.methods.acceptBet()
    .accounts({ bet: betPDA, vault: vaultPDA, taker: taker.publicKey, systemProgram: SystemProgram.programId })
    .signers([taker]).rpc();
  console.log(`TX: ${sig3}`);
  const vaultAfterAccept = await connection.getBalance(vaultPDA);
  console.log(`Vault: ${vaultAfterAccept / LAMPORTS_PER_SOL} SOL`);

  let betAccount = await program.account.betAccount.fetch(betPDA);
  console.log(`On-chain status: ${JSON.stringify(betAccount.status)}`);

  // Step 4: Wait for deadline
  console.log("\n=== Step 4: Wait for deadline (15s) ===");
  await new Promise(r => setTimeout(r, 16_000));

  // Step 5: Run hosted resolver
  console.log("\n=== Step 5: Run hosted resolver ===");
  const resolveRes = await fetch(`${APP_URL}/api/resolver/run/${BET_DB_ID}`, {
    method: "POST",
    headers: { "x-admin-api-key": ADMIN_KEY },
  });
  const resolveData = await resolveRes.json();
  console.log(`Status: ${resolveRes.status}`);
  console.log(`Response: ${JSON.stringify(resolveData).slice(0, 200)}`);

  // Check DB state
  const betAfterResolve = await (await fetch(`${APP_URL}/api/bets/${BET_DB_ID}`)).json();
  console.log(`DB status after resolve: ${betAfterResolve.status}`);
  console.log(`DB proposed winner: ${betAfterResolve.proposedWinner}`);
  console.log(`DB evidence hash: ${betAfterResolve.evidenceHash}`);
  console.log(`DB confidence: ${betAfterResolve.resolverConfidence}`);
  console.log(`DB needs review: ${betAfterResolve.needsManualReview}`);

  // Step 6: Admin finalize (DB side)
  console.log("\n=== Step 6: Admin finalize ===");
  const winnerSide = betAfterResolve.proposedWinner || "YES";
  const finalizeRes = await fetch(`${APP_URL}/api/admin/bets/${BET_DB_ID}/finalize`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "x-admin-api-key": ADMIN_KEY },
    body: JSON.stringify({ winner_side: winnerSide, confirmation: "FINALIZE" }),
  });
  const finalizeData = await finalizeRes.json();
  console.log(`Finalize: ${JSON.stringify(finalizeData)}`);

  // Step 7: Verify DB final state
  console.log("\n=== Step 7: Final verification ===");
  const betFinal = await (await fetch(`${APP_URL}/api/bets/${BET_DB_ID}`)).json();
  console.log(`DB status: ${betFinal.status}`);
  console.log(`DB final winner: ${betFinal.finalWinner}`);

  betAccount = await program.account.betAccount.fetch(betPDA);
  const vaultFinal = await connection.getBalance(vaultPDA);
  console.log(`On-chain status: ${JSON.stringify(betAccount.status)}`);
  console.log(`Vault balance: ${vaultFinal / LAMPORTS_PER_SOL} SOL`);
  console.log(`On-chain evidence hash: ${Buffer.from(betAccount.evidenceHash).toString("hex")}`);

  // Summary
  console.log("\n========================================");
  console.log("  HOSTED E2E RESULTS");
  console.log("========================================");
  console.log(`Bet DB ID:     ${BET_DB_ID}`);
  console.log(`Bet PDA:       ${betPDA.toBase58()}`);
  console.log(`DB status:     ${betFinal.status}`);
  console.log(`On-chain:      ${JSON.stringify(betAccount.status)}`);
  console.log(`Vault final:   ${vaultFinal} lamports`);
  console.log(`Evidence hash: ${betFinal.evidenceHash || "(none - manual review)"}`);
  console.log("");
  console.log("TX SIGNATURES:");
  console.log(`  init:   https://explorer.solana.com/tx/${sig1}?cluster=devnet`);
  console.log(`  fund:   https://explorer.solana.com/tx/${sig2}?cluster=devnet`);
  console.log(`  accept: https://explorer.solana.com/tx/${sig3}?cluster=devnet`);
  console.log("");
  console.log(`Bet page: ${APP_URL}/bet/${BET_DB_ID}`);
}

main().catch(console.error);
