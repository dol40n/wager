import * as anchor from "@coral-xyz/anchor";
import { Program } from "@coral-xyz/anchor";
import {
  Keypair, PublicKey, SystemProgram, LAMPORTS_PER_SOL,
} from "@solana/web3.js";
import { expect } from "chai";
import { createHash } from "crypto";

const IDL = require("../../target/idl/wager_escrow.json");

describe("DEVNET smoke test", () => {
  const provider = anchor.AnchorProvider.env();
  anchor.setProvider(provider);
  const program = new Program(IDL, provider);
  const programId = program.programId;

  const maker = Keypair.generate();
  const taker = Keypair.generate();
  const resolver = Keypair.generate();
  const feeWallet = Keypair.generate();

  const STAKE = 0.05 * LAMPORTS_PER_SOL; // 0.05 SOL — small for devnet
  const FEE_BPS = 100; // 1%

  const txSigs: Record<string, string> = {};

  function betHash(id: string) {
    return createHash("sha256").update(id).digest();
  }
  function betPDA(hash: Buffer): [PublicKey, number] {
    return PublicKey.findProgramAddressSync([Buffer.from("bet"), hash], programId);
  }
  function vaultPDA(bet: PublicKey): [PublicKey, number] {
    return PublicKey.findProgramAddressSync([Buffer.from("vault"), bet.toBuffer()], programId);
  }

  async function fund(to: Keypair, lamports: number) {
    const tx = new anchor.web3.Transaction().add(
      SystemProgram.transfer({
        fromPubkey: provider.wallet.publicKey,
        toPubkey: to.publicKey,
        lamports,
      })
    );
    await provider.sendAndConfirm(tx);
  }

  before(async () => {
    console.log(`    Program ID: ${programId.toBase58()}`);
    console.log(`    Provider:   ${provider.wallet.publicKey.toBase58()}`);
    console.log(`    Provider balance: ${(await provider.connection.getBalance(provider.wallet.publicKey)) / LAMPORTS_PER_SOL} SOL`);
    console.log(`    Maker:   ${maker.publicKey.toBase58()}`);
    console.log(`    Taker:   ${taker.publicKey.toBase58()}`);
    console.log(`    Resolver: ${resolver.publicKey.toBase58()}`);
    console.log(`    Fee wallet: ${feeWallet.publicKey.toBase58()}`);

    // Fund wallets from deployer (0.15 SOL each for maker/taker, 0.02 for resolver)
    await fund(maker, 0.15 * LAMPORTS_PER_SOL);
    await fund(taker, 0.15 * LAMPORTS_PER_SOL);
    await fund(resolver, 0.02 * LAMPORTS_PER_SOL);
    console.log(`    Wallets funded`);
  });

  it("full devnet lifecycle: create → fund → accept → propose → dispute → admin finalize", async () => {
    const hash = betHash("devnet-smoke-" + Date.now());
    const [bet] = betPDA(hash);
    const [vault] = vaultPDA(bet);
    const deadline = Math.floor(Date.now() / 1000) + 5; // 5 seconds from now

    // 1. Initialize bet
    const sig1 = await program.methods
      .initializeBet(
        Array.from(hash), { yes: {} }, new anchor.BN(STAKE),
        new anchor.BN(deadline), FEE_BPS, null
      )
      .accounts({
        bet, vault, maker: maker.publicKey,
        resolverAuthority: resolver.publicKey,
        systemProgram: SystemProgram.programId,
      })
      .signers([maker])
      .rpc();
    txSigs["initialize_bet"] = sig1;
    console.log(`    [1] initialize_bet: ${sig1}`);

    let betAccount = await program.account.betAccount.fetch(bet);
    expect(betAccount.status).to.deep.equal({ open: {} });

    // 2. Fund maker
    const sig2 = await program.methods.fundMaker()
      .accounts({ bet, vault, maker: maker.publicKey, systemProgram: SystemProgram.programId })
      .signers([maker]).rpc();
    txSigs["fund_maker"] = sig2;
    console.log(`    [2] fund_maker: ${sig2}`);

    const vaultBal = await provider.connection.getBalance(vault);
    expect(vaultBal).to.equal(STAKE);
    console.log(`    Vault after fund: ${vaultBal / LAMPORTS_PER_SOL} SOL`);

    // 3. Accept bet
    const sig3 = await program.methods.acceptBet()
      .accounts({ bet, vault, taker: taker.publicKey, systemProgram: SystemProgram.programId })
      .signers([taker]).rpc();
    txSigs["accept_bet"] = sig3;
    console.log(`    [3] accept_bet: ${sig3}`);

    betAccount = await program.account.betAccount.fetch(bet);
    expect(betAccount.status).to.deep.equal({ accepted: {} });
    expect(betAccount.taker!.toBase58()).to.equal(taker.publicKey.toBase58());

    const vaultAfterAccept = await provider.connection.getBalance(vault);
    expect(vaultAfterAccept).to.equal(STAKE * 2);
    console.log(`    Vault after accept: ${vaultAfterAccept / LAMPORTS_PER_SOL} SOL`);

    // 4. Wait for deadline
    console.log(`    Waiting for deadline (5s)...`);
    await new Promise((r) => setTimeout(r, 6000));

    // 5. Propose result
    const evidence = JSON.stringify([{ source: "devnet-test", supports: "YES" }]);
    const evidenceHash = createHash("sha256").update(evidence).digest();

    const sig4 = await program.methods
      .proposeResult(maker.publicKey, Array.from(evidenceHash))
      .accounts({ bet, resolverAuthority: resolver.publicKey })
      .signers([resolver]).rpc();
    txSigs["propose_result"] = sig4;
    console.log(`    [4] propose_result: ${sig4}`);

    betAccount = await program.account.betAccount.fetch(bet);
    expect(betAccount.status).to.deep.equal({ resultProposed: {} });
    expect(Buffer.from(betAccount.evidenceHash).toString("hex")).to.equal(evidenceHash.toString("hex"));
    console.log(`    Evidence hash on-chain: ${Buffer.from(betAccount.evidenceHash).toString("hex")}`);
    console.log(`    Evidence hash computed: ${evidenceHash.toString("hex")}`);

    // 6. Dispute
    const sig5 = await program.methods.disputeResult()
      .accounts({ bet, disputer: taker.publicKey })
      .signers([taker]).rpc();
    txSigs["dispute_result"] = sig5;
    console.log(`    [5] dispute_result: ${sig5}`);

    betAccount = await program.account.betAccount.fetch(bet);
    expect(betAccount.status).to.deep.equal({ disputed: {} });

    // 7. Admin finalize
    const makerBalPre = await provider.connection.getBalance(maker.publicKey);
    const feeBalPre = await provider.connection.getBalance(feeWallet.publicKey);

    const sig6 = await program.methods.adminFinalizeDisputed(maker.publicKey)
      .accounts({
        bet, vault, winner: maker.publicKey, feeWallet: feeWallet.publicKey,
        resolverAuthority: resolver.publicKey, systemProgram: SystemProgram.programId,
      })
      .signers([resolver]).rpc();
    txSigs["admin_finalize"] = sig6;
    console.log(`    [6] admin_finalize: ${sig6}`);

    betAccount = await program.account.betAccount.fetch(bet);
    expect(betAccount.status).to.deep.equal({ finalized: {} });
    expect(betAccount.finalWinner!.toBase58()).to.equal(maker.publicKey.toBase58());

    // 8. Verify balances
    const vaultFinal = await provider.connection.getBalance(vault);
    const makerBalPost = await provider.connection.getBalance(maker.publicKey);
    const feeBalPost = await provider.connection.getBalance(feeWallet.publicKey);

    const pot = STAKE * 2;
    const expectedFee = Math.floor(pot * FEE_BPS / 10_000);
    const expectedPayout = pot - expectedFee;

    expect(vaultFinal).to.equal(0);
    expect(feeBalPost - feeBalPre).to.equal(expectedFee);
    expect(makerBalPost - makerBalPre).to.equal(expectedPayout);

    console.log(`    Vault final: ${vaultFinal} lamports`);
    console.log(`    Fee received: ${(feeBalPost - feeBalPre) / LAMPORTS_PER_SOL} SOL (expected ${expectedFee / LAMPORTS_PER_SOL})`);
    console.log(`    Winner received: ${(makerBalPost - makerBalPre) / LAMPORTS_PER_SOL} SOL (expected ${expectedPayout / LAMPORTS_PER_SOL})`);

    // 9. Double payout fails
    try {
      await program.methods.adminFinalizeDisputed(taker.publicKey)
        .accounts({ bet, vault, winner: taker.publicKey, feeWallet: feeWallet.publicKey, resolverAuthority: resolver.publicKey, systemProgram: SystemProgram.programId })
        .signers([resolver]).rpc();
      expect.fail("double payout should fail");
    } catch (e: any) {
      expect(e.error.errorCode.code).to.equal("InvalidStatus");
      console.log(`    Double payout rejected: ${e.error.errorCode.code}`);
    }

    // 10. Refund after finalize fails
    try {
      await program.methods.refundIfExpiredOrUnresolved()
        .accounts({ bet, vault, maker: maker.publicKey, taker: taker.publicKey, systemProgram: SystemProgram.programId })
        .rpc();
      expect.fail("refund after finalize should fail");
    } catch (e: any) {
      expect(e.error.errorCode.code).to.equal("NotExpiredOrResolved");
      console.log(`    Refund after finalize rejected: ${e.error.errorCode.code}`);
    }

    // Print summary
    console.log(`\n    === DEVNET TRANSACTION SIGNATURES ===`);
    for (const [name, sig] of Object.entries(txSigs)) {
      console.log(`    ${name}: https://explorer.solana.com/tx/${sig}?cluster=devnet`);
    }
  });
});
