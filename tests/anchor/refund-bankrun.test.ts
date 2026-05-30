import { describe, it, expect, beforeAll } from "vitest";
import { startAnchor, Clock, ProgramTestContext } from "solana-bankrun";
import { BankrunProvider } from "anchor-bankrun";
import { Program, BN } from "@coral-xyz/anchor";
import { Keypair, PublicKey, SystemProgram, LAMPORTS_PER_SOL } from "@solana/web3.js";
import { createHash } from "crypto";

// Exercises the refund_if_expired_or_unresolved fix: when a bet has a taker,
// the taker account must be supplied (otherwise the maker could claim the
// taker's half). Requires clock control to pass the 7-day refund timeout,
// which a live validator can't fast-forward — hence bankrun.

const IDL = require("../../target/idl/wager_escrow.json");
const PROGRAM_ID = new PublicKey(IDL.address);
const STAKE = 0.5 * LAMPORTS_PER_SOL;
const FEE_BPS = 100;
const SEVEN_DAYS = 7 * 86_400;

function betIdHash(id: string): Buffer {
  return createHash("sha256").update(id).digest();
}
function fundedAccount(pubkey: PublicKey, lamports: number) {
  return {
    address: pubkey,
    info: { lamports, data: Buffer.alloc(0), owner: SystemProgram.programId, executable: false },
  };
}

describe("refund_if_expired_or_unresolved (bankrun)", () => {
  let context: ProgramTestContext;
  let program: Program;
  const maker = Keypair.generate();
  const taker = Keypair.generate();
  const resolver = Keypair.generate();

  async function setupAcceptedBet(id: string) {
    const hash = betIdHash(id);
    const [betPDA] = PublicKey.findProgramAddressSync([Buffer.from("bet"), hash], PROGRAM_ID);
    const [vaultPDA] = PublicKey.findProgramAddressSync([Buffer.from("vault"), betPDA.toBuffer()], PROGRAM_ID);

    const clock = await context.banksClient.getClock();
    const deadline = Number(clock.unixTimestamp) + 3600;

    await program.methods
      .initializeBet([...hash], { yes: {} }, new BN(STAKE), new BN(deadline), FEE_BPS, null)
      .accounts({
        bet: betPDA,
        vault: vaultPDA,
        maker: maker.publicKey,
        resolverAuthority: resolver.publicKey,
        systemProgram: SystemProgram.programId,
      })
      .signers([maker])
      .rpc();

    await program.methods
      .fundMaker()
      .accounts({ bet: betPDA, vault: vaultPDA, maker: maker.publicKey, systemProgram: SystemProgram.programId })
      .signers([maker])
      .rpc();

    await program.methods
      .acceptBet()
      .accounts({ bet: betPDA, vault: vaultPDA, taker: taker.publicKey, systemProgram: SystemProgram.programId })
      .signers([taker])
      .rpc();

    return { betPDA, vaultPDA, deadline };
  }

  async function warpPast(deadline: number) {
    const clock = await context.banksClient.getClock();
    context.setClock(
      new Clock(
        clock.slot,
        clock.epochStartTimestamp,
        clock.epoch,
        clock.leaderScheduleEpoch,
        BigInt(deadline + SEVEN_DAYS + 100)
      )
    );
  }

  beforeAll(async () => {
    context = await startAnchor(
      "",
      [{ name: "wager_escrow", programId: PROGRAM_ID }],
      [
        fundedAccount(maker.publicKey, 5 * LAMPORTS_PER_SOL),
        fundedAccount(taker.publicKey, 5 * LAMPORTS_PER_SOL),
        fundedAccount(resolver.publicKey, LAMPORTS_PER_SOL),
      ]
    );
    const provider = new BankrunProvider(context);
    program = new Program(IDL, provider);
  });

  it("rejects refund that omits the taker account when a taker exists", async () => {
    const { betPDA, vaultPDA, deadline } = await setupAcceptedBet("refund-omit-taker");
    await warpPast(deadline);

    await expect(
      program.methods
        .refundIfExpiredOrUnresolved()
        .accounts({
          bet: betPDA,
          vault: vaultPDA,
          maker: maker.publicKey,
          taker: null, // omitted — must be rejected
          systemProgram: SystemProgram.programId,
        })
        .rpc()
    ).rejects.toThrow();
  });

  it("refunds 50/50 to maker and taker when the taker account is provided", async () => {
    const { betPDA, vaultPDA, deadline } = await setupAcceptedBet("refund-split");
    await warpPast(deadline);

    const makerBefore = (await context.banksClient.getAccount(maker.publicKey))!.lamports;
    const takerBefore = (await context.banksClient.getAccount(taker.publicKey))!.lamports;

    await program.methods
      .refundIfExpiredOrUnresolved()
      .accounts({
        bet: betPDA,
        vault: vaultPDA,
        maker: maker.publicKey,
        taker: taker.publicKey,
        systemProgram: SystemProgram.programId,
      })
      .rpc();

    const vault = await context.banksClient.getAccount(vaultPDA);
    const makerAfter = (await context.banksClient.getAccount(maker.publicKey))!.lamports;
    const takerAfter = (await context.banksClient.getAccount(taker.publicKey))!.lamports;

    // Vault drained, and each party recovered ~half the 2*STAKE pot.
    expect(vault === null || vault.lamports === 0).toBe(true);
    expect(Number(makerAfter - makerBefore)).toBeGreaterThanOrEqual(STAKE - 1);
    expect(Number(takerAfter - takerBefore)).toBeGreaterThanOrEqual(STAKE - 1);
  });
});
