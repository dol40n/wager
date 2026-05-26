import { Connection, VersionedTransaction } from "@solana/web3.js";

export interface WalletAdapter {
  publicKey: { toBase58(): string } | null;
  signTransaction<T extends VersionedTransaction>(tx: T): Promise<T>;
}

export async function sendSerializedTransactionWithWallet(params: {
  serializedTransactionBase64: string;
  wallet: WalletAdapter;
  connection: Connection;
}): Promise<string> {
  const { serializedTransactionBase64, wallet, connection } = params;

  if (!wallet.publicKey) {
    throw new Error("Wallet not connected");
  }

  const txBytes = Buffer.from(serializedTransactionBase64, "base64");
  const tx = VersionedTransaction.deserialize(txBytes);

  const signed = await wallet.signTransaction(tx);

  const sig = await connection.sendRawTransaction(signed.serialize(), {
    skipPreflight: false,
    preflightCommitment: "confirmed",
  });

  await connection.confirmTransaction(sig, "confirmed");

  return sig;
}
