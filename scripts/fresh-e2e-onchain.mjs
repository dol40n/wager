import pkg from "@coral-xyz/anchor";
const { AnchorProvider, Program, Wallet, BN, web3 } = pkg;
import { Keypair, PublicKey, SystemProgram, LAMPORTS_PER_SOL, Connection } from "@solana/web3.js";
import { createHash } from "crypto";
import { readFileSync } from "fs";
import { homedir } from "os";
import { createRequire } from "module";
const require = createRequire(import.meta.url);
const IDL = require("../target/idl/wager_escrow.json");

const APP = "https://wager-smoky.vercel.app";
const ADMIN = "wager-devnet-admin-2026";
const STAKE = 0.05 * LAMPORTS_PER_SOL;

const conn = new Connection("https://api.devnet.solana.com", "confirmed");
const kp = Keypair.fromSecretKey(Uint8Array.from(JSON.parse(readFileSync(homedir()+"/.config/solana/id.json","utf8"))));
const prov = new AnchorProvider(conn, new Wallet(kp), { commitment: "confirmed" });
pkg.setProvider(prov);
const prog = new Program(IDL, prov);

const health = await(await fetch(APP+"/api/health")).json();
const resolver = new PublicKey(health.resolver_authority);
const maker = kp;
const taker = Keypair.generate();

console.log("=== Fresh E2E On-Chain Settlement ===");
console.log("Maker:", maker.publicKey.toBase58());
console.log("Taker:", taker.publicKey.toBase58());
console.log("Resolver:", resolver.toBase58());

// Step 0: Create in DB
const dl = new Date(Date.now() + 15000).toISOString();
const cr = await(await fetch(APP+"/api/bets/create", {
  method: "POST", headers: {"Content-Type":"application/json"},
  body: JSON.stringify({
    original_text: "Fresh on-chain settlement test bet",
    normalized_question: "Will the on-chain settlement test pass?",
    category: "custom",
    yes_definition: "On-chain settlement completes successfully",
    no_definition: "On-chain settlement does not complete",
    deadline_utc: dl,
    resolution_sources: ["Test runner"],
    resolution_method: "manual_review",
    objective_criteria: ["All steps pass"],
    ambiguity_score: 0, ambiguity_notes: [],
    maker_side: "YES", stake_lamports: STAKE,
    maker_pubkey: maker.publicKey.toBase58(),
  }),
})).json();
console.log("\nDB ID:", cr.id);
const hash = Buffer.from(cr.betIdHash, "hex");
const [betPDA] = PublicKey.findProgramAddressSync([Buffer.from("bet"), hash], prog.programId);
const [vaultPDA] = PublicKey.findProgramAddressSync([Buffer.from("vault"), betPDA.toBuffer()], prog.programId);

// Step 1-3: On-chain init, fund, accept
const dts = Math.floor(Date.now()/1000) + 15;
const s1 = await prog.methods.initializeBet(Array.from(hash), {yes:{}}, new BN(STAKE), new BN(dts), 100, null)
  .accounts({bet:betPDA, vault:vaultPDA, maker:maker.publicKey, resolverAuthority:resolver, systemProgram:SystemProgram.programId})
  .signers([maker]).rpc();
console.log("init:", s1);

const s2 = await prog.methods.fundMaker()
  .accounts({bet:betPDA, vault:vaultPDA, maker:maker.publicKey, systemProgram:SystemProgram.programId})
  .signers([maker]).rpc();
console.log("fund:", s2, "- vault:", await conn.getBalance(vaultPDA)/LAMPORTS_PER_SOL, "SOL");

await prov.sendAndConfirm(new web3.Transaction().add(
  SystemProgram.transfer({fromPubkey:maker.publicKey, toPubkey:taker.publicKey, lamports:0.1*LAMPORTS_PER_SOL})
));
const s3 = await prog.methods.acceptBet()
  .accounts({bet:betPDA, vault:vaultPDA, taker:taker.publicKey, systemProgram:SystemProgram.programId})
  .signers([taker]).rpc();
console.log("accept:", s3, "- vault:", await conn.getBalance(vaultPDA)/LAMPORTS_PER_SOL, "SOL");

// Sync DB
await fetch(APP+"/api/bets/"+cr.id+"/sync", {
  method:"POST", headers:{"Content-Type":"application/json","x-admin-api-key":ADMIN},
  body: JSON.stringify({status:"ACCEPTED", taker_pubkey:taker.publicKey.toBase58()}),
});

// Wait for deadline
console.log("\nWaiting 16s for deadline...");
await new Promise(r => setTimeout(r, 16000));

// Step 4: Propose result on-chain (via hosted — has resolver key)
console.log("\n=== Calling finalize-onchain (will propose first) ===");
const fin1 = await(await fetch(APP+"/api/admin/bets/"+cr.id+"/finalize-onchain", {
  method:"POST", headers:{"Content-Type":"application/json","x-admin-api-key":ADMIN},
  body: JSON.stringify({winner_side:"YES", confirmation:"FINALIZE"}),
})).json();
console.log("Response:", JSON.stringify(fin1, null, 2));

// If ResultProposed, we need to dispute then finalize
if (fin1.status === "RESULT_PROPOSED") {
  console.log("\n=== Disputing with taker ===");
  const s5 = await prog.methods.disputeResult()
    .accounts({bet:betPDA, disputer:taker.publicKey})
    .signers([taker]).rpc();
  console.log("dispute:", s5);

  // Sync DB to DISPUTED
  await fetch(APP+"/api/bets/"+cr.id+"/sync", {
    method:"POST", headers:{"Content-Type":"application/json","x-admin-api-key":ADMIN},
    body: JSON.stringify({status:"DISPUTED"}),
  });

  console.log("\n=== Calling finalize-onchain (admin_finalize_disputed) ===");
  const fin2 = await(await fetch(APP+"/api/admin/bets/"+cr.id+"/finalize-onchain", {
    method:"POST", headers:{"Content-Type":"application/json","x-admin-api-key":ADMIN},
    body: JSON.stringify({winner_side:"YES", confirmation:"FINALIZE"}),
  })).json();
  console.log("Response:", JSON.stringify(fin2, null, 2));
}

// Final verification
console.log("\n=== FINAL VERIFICATION ===");
const vf = await conn.getBalance(vaultPDA);
const dbf = await(await fetch(APP+"/api/bets/"+cr.id)).json();
console.log("Vault:", vf/LAMPORTS_PER_SOL, "SOL");
console.log("DB status:", dbf.status);
console.log("DB winner:", dbf.finalWinner);
console.log("Bet page:", APP+"/bet/"+cr.id);
