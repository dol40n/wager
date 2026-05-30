import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  Keypair,
  PublicKey,
  SystemProgram,
  TransactionMessage,
  VersionedTransaction,
} from "@solana/web3.js";
import { signAndSendTx } from "@/lib/solana/transactions";
import * as program from "@/lib/solana/program";

function buildSignedTx(): { tx: VersionedTransaction; payer: Keypair } {
  const payer = Keypair.generate();
  const message = new TransactionMessage({
    payerKey: payer.publicKey,
    recentBlockhash: PublicKey.default.toBase58(), // dummy 32-byte hash
    instructions: [
      SystemProgram.transfer({
        fromPubkey: payer.publicKey,
        toPubkey: Keypair.generate().publicKey,
        lamports: 1,
      }),
    ],
  }).compileToV0Message();
  return { tx: new VersionedTransaction(message), payer };
}

function mockConnection(over: Partial<Record<string, unknown>>) {
  return {
    getBlockHeight: vi.fn().mockResolvedValue(1000),
    sendRawTransaction: vi.fn(),
    confirmTransaction: vi.fn().mockResolvedValue({ value: { err: null } }),
    ...over,
  };
}

describe("signAndSendTx", () => {
  beforeEach(() => vi.restoreAllMocks());

  it("confirms with blockhash + lastValidBlockHeight strategy", async () => {
    const conn = mockConnection({
      sendRawTransaction: vi.fn().mockResolvedValue("sigOK"),
    });
    vi.spyOn(program, "getConnection").mockReturnValue(conn as never);

    const { tx, payer } = buildSignedTx();
    const sig = await signAndSendTx(tx, [payer]);

    expect(sig).toBe("sigOK");
    const strategy = (conn.confirmTransaction as ReturnType<typeof vi.fn>).mock.calls[0][0];
    expect(strategy.signature).toBe("sigOK");
    expect(strategy.blockhash).toBe(PublicKey.default.toBase58());
    expect(strategy.lastValidBlockHeight).toBe(1150); // 1000 + 150
  });

  it("retries on a transient send error then succeeds", async () => {
    const send = vi
      .fn()
      .mockRejectedValueOnce(new Error("503 Service Unavailable"))
      .mockResolvedValueOnce("sigRetry");
    const conn = mockConnection({ sendRawTransaction: send });
    vi.spyOn(program, "getConnection").mockReturnValue(conn as never);

    const { tx, payer } = buildSignedTx();
    const sig = await signAndSendTx(tx, [payer], { maxRetries: 3 });

    expect(sig).toBe("sigRetry");
    expect(send).toHaveBeenCalledTimes(2);
  });

  it("fails fast on an expired blockhash (no retry)", async () => {
    const send = vi.fn().mockRejectedValue(new Error("block height exceeded"));
    const conn = mockConnection({ sendRawTransaction: send });
    vi.spyOn(program, "getConnection").mockReturnValue(conn as never);

    const { tx, payer } = buildSignedTx();
    await expect(signAndSendTx(tx, [payer], { maxRetries: 3 })).rejects.toThrow(
      /block height exceeded/
    );
    expect(send).toHaveBeenCalledTimes(1); // no retry
  });

  it("throws when the TX lands but errors on-chain", async () => {
    const conn = mockConnection({
      sendRawTransaction: vi.fn().mockResolvedValue("sigErr"),
      confirmTransaction: vi.fn().mockResolvedValue({ value: { err: { InstructionError: [0, "Custom"] } } }),
    });
    vi.spyOn(program, "getConnection").mockReturnValue(conn as never);

    const { tx, payer } = buildSignedTx();
    await expect(signAndSendTx(tx, [payer], { maxRetries: 1 })).rejects.toThrow(/failed on-chain/);
  });
});
