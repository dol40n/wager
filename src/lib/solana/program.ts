import { Connection, Keypair, PublicKey } from "@solana/web3.js";
import { createHash } from "crypto";
import bs58 from "bs58";
import { PROGRAM_ID, SOLANA_RPC_URL } from "../constants";

export function getConnection(): Connection {
  return new Connection(SOLANA_RPC_URL, "confirmed");
}

export function deriveBetPDA(betIdHash: Buffer): [PublicKey, number] {
  return PublicKey.findProgramAddressSync(
    [Buffer.from("bet"), betIdHash],
    PROGRAM_ID
  );
}

export function deriveVaultPDA(betPDA: PublicKey): [PublicKey, number] {
  return PublicKey.findProgramAddressSync(
    [Buffer.from("vault"), betPDA.toBuffer()],
    PROGRAM_ID
  );
}

export function computeBetIdHash(betId: string): Buffer {
  return createHash("sha256").update(betId).digest();
}

export function getResolverKeypair(): Keypair {
  const key = process.env.RESOLVER_AUTHORITY_PRIVATE_KEY;
  if (!key) throw new Error("RESOLVER_AUTHORITY_PRIVATE_KEY not set");
  if (key.startsWith("[")) {
    return Keypair.fromSecretKey(Uint8Array.from(JSON.parse(key)));
  }
  return Keypair.fromSecretKey(bs58.decode(key));
}

export function getResolverPublicKey(): PublicKey {
  return getResolverKeypair().publicKey;
}
