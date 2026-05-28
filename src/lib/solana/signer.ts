import { Keypair, PublicKey, VersionedTransaction } from "@solana/web3.js";
import { getResolverKeypair } from "./program";

// Abstraction over "how the resolver authority signs transactions".
// Decouples signing from key storage so we can move the key into a KMS
// (HashiCorp Vault Transit / Turnkey / Fireblocks — the Ed25519-capable
// options for Solana) by adding a new implementation, without touching
// the settlement logic. Switch backends via SIGNER_BACKEND env var.
export interface TransactionSigner {
  readonly publicKey: PublicKey;
  signTransaction(tx: VersionedTransaction): Promise<VersionedTransaction>;
}

// Default backend: private key held in an env var (devnet / pre-KMS).
// The key is in process memory — acceptable for devnet, replace before mainnet.
class EnvKeypairSigner implements TransactionSigner {
  private keypair: Keypair;

  constructor() {
    this.keypair = getResolverKeypair();
  }

  get publicKey(): PublicKey {
    return this.keypair.publicKey;
  }

  async signTransaction(tx: VersionedTransaction): Promise<VersionedTransaction> {
    tx.sign([this.keypair]);
    return tx;
  }
}

// KMS backend skeleton. To enable: implement signRawEd25519() against your
// KMS (Vault Transit `sign` endpoint, Turnkey signRawPayload, etc.), set
// SIGNER_BACKEND=kms, and provide the resolver public key + KMS credentials
// via env. The private key never enters this process.
class KmsSigner implements TransactionSigner {
  readonly publicKey: PublicKey;

  constructor() {
    const pubkey = process.env.RESOLVER_AUTHORITY_PUBLIC_KEY;
    if (!pubkey) {
      throw new Error("SIGNER_BACKEND=kms requires RESOLVER_AUTHORITY_PUBLIC_KEY");
    }
    this.publicKey = new PublicKey(pubkey);
  }

  async signTransaction(tx: VersionedTransaction): Promise<VersionedTransaction> {
    const message = tx.message.serialize();
    const signature = await this.signRawEd25519(message);
    tx.addSignature(this.publicKey, signature);
    return tx;
  }

  private async signRawEd25519(_message: Uint8Array): Promise<Uint8Array> {
    // TODO: call KMS to sign the message bytes with the resolver's Ed25519 key.
    // Example (Vault Transit): POST {VAULT_ADDR}/v1/transit/sign/{key}
    //   body: { input: base64(message) } → returns base64 signature.
    // Example (Turnkey): activities.signRawPayload({ payload, encoding: HEX }).
    throw new Error("KmsSigner.signRawEd25519 not implemented — provision KMS first");
  }
}

let cachedSigner: TransactionSigner | null = null;

export function getResolverSigner(): TransactionSigner {
  if (cachedSigner) return cachedSigner;
  const backend = (process.env.SIGNER_BACKEND || "env").toLowerCase();
  cachedSigner = backend === "kms" ? new KmsSigner() : new EnvKeypairSigner();
  return cachedSigner;
}
