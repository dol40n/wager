import { Connection, PublicKey } from "@solana/web3.js";
import { createHash } from "crypto";
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
