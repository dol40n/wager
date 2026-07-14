/**
 * End-to-end smoke test on localnet (solana-test-validator).
 * Tests the full wager lifecycle:
 *   create → fund → accept → propose → dispute → admin finalize → verify balances
 *   create → fund → accept → propose → (no dispute) → verify DisputeWindowActive
 *   create → fund → cancel → verify refund
 *
 * Run: npx ts-mocha -p tsconfig.anchor.json -t 60000 scripts/e2e-localnet.ts
 * Requires: solana-test-validator running, program deployed via anchor test --skip-build
 */

import * as anchor from "@coral-xyz/anchor";
import { Program } from "@coral-xyz/anchor";
import {
  Keypair,
  PublicKey,
  SystemProgram,
  LAMPORTS_PER_SOL,
} from "@solana/web3.js";
import { expect } from "chai";
import { createHash } from "crypto";

const IDL = require("../../target/idl/wager_escrow.json");

describe("E2E localnet smoke test", () => {
  const provider = anchor.AnchorProvider.env();
  anchor.setProvider(provider);
  const program = new Program(IDL, provider);
  const programId = program.programId;

  const maker = Keypair.generate();
  const taker = Keypair.generate();
  const resolver = Keypair.generate();
  const feeWallet = Keypair.generate();
  const STAKE = 0.5 * LAMPORTS_PER_SOL;
  const FEE_BPS = 100; // 1% platform fee

  function betHash(id: string) {
    return createHash("sha256").update(id).digest();
  }
  function betPDA(hash: Buffer): [PublicKey, number] {
    return PublicKey.findProgramAddressSync(
      [Buffer.from("bet"), hash],
      programId
    );
  }
  function vaultPDA(bet: PublicKey): [PublicKey, number] {
    return PublicKey.findProgramAddressSync(
      [Buffer.from("vault"), bet.toBuffer()],
      programId
    );
  }

  async function fundWallet(to: Keypair, amount: number) {
    const bal = await provider.connection.getBalance(to.publicKey);
    if (bal >= amount) return;
    try {
      const sig = await provider.connection.requestAirdrop(to.publicKey, amount);
      await provider.connection.confirmTransaction(sig);
    } catch {
      const tx = new anchor.web3.Transaction().add(
        SystemProgram.transfer({
          fromPubkey: provider.wallet.publicKey,
          toPubkey: to.publicKey,
          lamports: amount,
        })
      );
      await provider.sendAndConfirm(tx);
    }
  }

  before(async () => {
    for (const kp of [maker, taker, resolver]) {
      await fundWallet(kp, 2 * LAMPORTS_PER_SOL);
    }
  });

  it("full lifecycle: create → fund → accept → propose → dispute → admin finalize", async () => {
    const hash = betHash("e2e-full-lifecycle");
    const [bet] = betPDA(hash);
    const [vault] = vaultPDA(bet);
    const deadline = Math.floor(Date.now() / 1000) + 2;

    // 1. Initialize
    await program.methods
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

    let betAccount = await program.account.betAccount.fetch(bet);
    expect(betAccount.status).to.deep.equal({ open: {} });

    // 2. Fund maker
    await provider.connection.getBalance(maker.publicKey);
    await program.methods.fundMaker()
      .accounts({ bet, vault, maker: maker.publicKey, systemProgram: SystemProgram.programId })
      .signers([maker]).rpc();

    const vaultBalAfterFund = await provider.connection.getBalance(vault);
    expect(vaultBalAfterFund).to.equal(STAKE);

    // 3. Accept
    await provider.connection.getBalance(taker.publicKey);
    await program.methods.acceptBet()
      .accounts({ bet, vault, taker: taker.publicKey, systemProgram: SystemProgram.programId })
      .signers([taker]).rpc();

    betAccount = await program.account.betAccount.fetch(bet);
    expect(betAccount.status).to.deep.equal({ accepted: {} });
    expect(betAccount.taker!.toBase58()).to.equal(taker.publicKey.toBase58());

    const vaultBalAfterAccept = await provider.connection.getBalance(vault);
    expect(vaultBalAfterAccept).to.equal(STAKE * 2);
    console.log(`    Vault balance after accept: ${vaultBalAfterAccept / LAMPORTS_PER_SOL} SOL`);

    // 4. Wait for deadline
    await new Promise((r) => setTimeout(r, 3000));

    // 5. Propose result (maker wins)
    const evidence = JSON.stringify([{ source: "test", supports: "YES" }]);
    const evidenceHash = createHash("sha256").update(evidence).digest();

    await program.methods
      .proposeResult(maker.publicKey, Array.from(evidenceHash))
      .accounts({ bet, resolverAuthority: resolver.publicKey })
      .signers([resolver]).rpc();

    betAccount = await program.account.betAccount.fetch(bet);
    expect(betAccount.status).to.deep.equal({ resultProposed: {} });
    expect(Buffer.from(betAccount.evidenceHash)).to.deep.equal(evidenceHash);
    console.log(`    Evidence hash on-chain: ${Buffer.from(betAccount.evidenceHash).toString("hex")}`);
    console.log(`    Evidence hash computed: ${evidenceHash.toString("hex")}`);
    expect(Buffer.from(betAccount.evidenceHash).toString("hex")).to.equal(
      evidenceHash.toString("hex")
    );

    // 6. Dispute
    await program.methods.disputeResult()
      .accounts({ bet, disputer: taker.publicKey })
      .signers([taker]).rpc();

    betAccount = await program.account.betAccount.fetch(bet);
    expect(betAccount.status).to.deep.equal({ disputed: {} });

    // 7. Admin finalize (maker wins)
    const makerBalPreFinalize = await provider.connection.getBalance(maker.publicKey);
    const feeBalPre = await provider.connection.getBalance(feeWallet.publicKey);

    await program.methods.adminFinalizeDisputed(maker.publicKey)
      .accounts({
        bet, vault, winner: maker.publicKey, feeWallet: feeWallet.publicKey,
        resolverAuthority: resolver.publicKey, systemProgram: SystemProgram.programId,
      })
      .signers([resolver]).rpc();

    betAccount = await program.account.betAccount.fetch(bet);
    expect(betAccount.status).to.deep.equal({ finalized: {} });
    expect(betAccount.finalWinner!.toBase58()).to.equal(maker.publicKey.toBase58());

    // 8. Verify balances
    const vaultBalFinal = await provider.connection.getBalance(vault);
    const makerBalFinal = await provider.connection.getBalance(maker.publicKey);
    const feeBalFinal = await provider.connection.getBalance(feeWallet.publicKey);

    expect(vaultBalFinal).to.equal(0);
    console.log(`    Vault balance final: ${vaultBalFinal}`);

    const expectedFee = Math.floor((STAKE * 2 * FEE_BPS) / 10_000);
    const expectedPayout = STAKE * 2 - expectedFee;
    console.log(`    Expected fee: ${expectedFee / LAMPORTS_PER_SOL} SOL`);
    console.log(`    Expected payout: ${expectedPayout / LAMPORTS_PER_SOL} SOL`);
    console.log(`    Fee wallet received: ${(feeBalFinal - feeBalPre) / LAMPORTS_PER_SOL} SOL`);
    console.log(`    Maker received: ${(makerBalFinal - makerBalPreFinalize) / LAMPORTS_PER_SOL} SOL`);

    expect(feeBalFinal - feeBalPre).to.equal(expectedFee);
    expect(makerBalFinal - makerBalPreFinalize).to.equal(expectedPayout);

    // Fee regression: with 0.5 SOL each side (1 SOL pot) and 100 bps (1%):
    //   fee must be exactly 0.01 SOL = 10_000_000 lamports
    //   payout must be exactly 0.99 SOL = 990_000_000 lamports
    const pot = STAKE * 2; // 1_000_000_000
    expect(FEE_BPS).to.equal(100, "platform fee must be 1% (100 bps)");
    expect(expectedFee).to.equal(Math.floor(pot / 100), "fee = 1% of pot");
    expect(expectedPayout).to.equal(pot - expectedFee, "payout = 99% of pot");
    expect(feeBalFinal - feeBalPre).to.equal(10_000_000, "fee wallet gets 0.01 SOL");
    expect(makerBalFinal - makerBalPreFinalize).to.equal(990_000_000, "winner gets 0.99 SOL");

    // 9. Verify double payout fails
    try {
      await program.methods.adminFinalizeDisputed(taker.publicKey)
        .accounts({
          bet, vault, winner: taker.publicKey, feeWallet: feeWallet.publicKey,
          resolverAuthority: resolver.publicKey, systemProgram: SystemProgram.programId,
        })
        .signers([resolver]).rpc();
      expect.fail("Double payout should fail");
    } catch (e: any) {
      expect(e.error.errorCode.code).to.equal("InvalidStatus");
      console.log("    Double payout correctly rejected: InvalidStatus");
    }

    // 10. Verify refund after payout fails
    try {
      await program.methods.refundIfExpiredOrUnresolved()
        .accounts({
          bet, vault, maker: maker.publicKey,
          taker: taker.publicKey, systemProgram: SystemProgram.programId,
        })
        .rpc();
      expect.fail("Refund after payout should fail");
    } catch (e: any) {
      expect(e.error.errorCode.code).to.equal("NotExpiredOrResolved");
      console.log("    Refund after payout correctly rejected: NotExpiredOrResolved");
    }
  });

  it("cancel flow: create → fund → cancel → verify refund", async () => {
    const hash = betHash("e2e-cancel-flow");
    const [bet] = betPDA(hash);
    const [vault] = vaultPDA(bet);

    await program.methods
      .initializeBet(
        Array.from(hash), { no: {} }, new anchor.BN(STAKE),
        new anchor.BN(Math.floor(Date.now() / 1000) + 3600), FEE_BPS, null
      )
      .accounts({
        bet, vault, maker: maker.publicKey,
        resolverAuthority: resolver.publicKey,
        systemProgram: SystemProgram.programId,
      })
      .signers([maker]).rpc();

    await program.methods.fundMaker()
      .accounts({ bet, vault, maker: maker.publicKey, systemProgram: SystemProgram.programId })
      .signers([maker]).rpc();

    const vaultBal = await provider.connection.getBalance(vault);
    expect(vaultBal).to.equal(STAKE);

    const makerPre = await provider.connection.getBalance(maker.publicKey);
    await program.methods.cancelUnacceptedBet()
      .accounts({ bet, vault, maker: maker.publicKey, systemProgram: SystemProgram.programId })
      .signers([maker]).rpc();

    const makerPost = await provider.connection.getBalance(maker.publicKey);
    const vaultPost = await provider.connection.getBalance(vault);

    expect(vaultPost).to.equal(0);
    // Maker gets back the stake minus tx fee
    expect(makerPost - makerPre).to.be.greaterThan(STAKE - 10000);
    console.log(`    Maker recovered: ${(makerPost - makerPre) / LAMPORTS_PER_SOL} SOL`);

    const betAccount = await program.account.betAccount.fetch(bet);
    expect(betAccount.status).to.deep.equal({ cancelled: {} });
  });

  it("DisputeWindowActive guard prevents premature finalize", async () => {
    const hash = betHash("e2e-dispute-window");
    const [bet] = betPDA(hash);
    const [vault] = vaultPDA(bet);
    const deadline = Math.floor(Date.now() / 1000) + 2;

    await program.methods
      .initializeBet(
        Array.from(hash), { yes: {} }, new anchor.BN(STAKE),
        new anchor.BN(deadline), FEE_BPS, null
      )
      .accounts({
        bet, vault, maker: maker.publicKey,
        resolverAuthority: resolver.publicKey,
        systemProgram: SystemProgram.programId,
      })
      .signers([maker]).rpc();

    await program.methods.fundMaker()
      .accounts({ bet, vault, maker: maker.publicKey, systemProgram: SystemProgram.programId })
      .signers([maker]).rpc();

    await program.methods.acceptBet()
      .accounts({ bet, vault, taker: taker.publicKey, systemProgram: SystemProgram.programId })
      .signers([taker]).rpc();

    await new Promise((r) => setTimeout(r, 3000));

    const evidenceHash = createHash("sha256").update("test").digest();
    await program.methods
      .proposeResult(taker.publicKey, Array.from(evidenceHash))
      .accounts({ bet, resolverAuthority: resolver.publicKey })
      .signers([resolver]).rpc();

    // Try to finalize immediately (dispute window is 24h)
    try {
      await program.methods.finalizeResultAfterDisputeWindow()
        .accounts({
          bet, vault, winner: taker.publicKey,
          feeWallet: feeWallet.publicKey,
          systemProgram: SystemProgram.programId,
        })
        .rpc();
      expect.fail("Should fail - dispute window active");
    } catch (e: any) {
      expect(e.error.errorCode.code).to.equal("DisputeWindowActive");
      console.log("    DisputeWindowActive correctly enforced");
    }
  });
});
