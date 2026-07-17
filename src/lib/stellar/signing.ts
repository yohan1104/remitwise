import "server-only";
import { prisma } from "@/lib/prisma";
import { decryptSecret } from "@/lib/crypto";

/**
 * Custody seam — the single place where "who signs for this user" is decided.
 *
 * Today every wallet is custodial: the platform holds an AES-256-GCM-encrypted
 * secret and decrypts it transiently to sign. The seam exists so non-custodial
 * wallets slot in without touching business logic: an `external` wallet will
 * return signatures produced client-side (Freighter / WalletConnect) instead
 * of a decrypted secret, and callers that receive `SignatureRequiredError`
 * ship the unsigned XDR to the client for signing.
 *
 * See docs/ARCHITECTURE.md § Custody model for the full migration path.
 */

export type WalletMode = "custodial" | "external";

export interface UserSigner {
  publicKey: string;
  mode: WalletMode;
  /**
   * Custodial-only: decrypt the signing secret. Never log, never persist the
   * return value; hold it only for the duration of one transaction build.
   */
  getSecret(): Promise<string>;
}

/** Thrown when an operation needs a signature the server cannot produce. */
export class SignatureRequiredError extends Error {
  constructor(
    public readonly publicKey: string,
    public readonly unsignedXdr?: string,
  ) {
    super("This wallet is non-custodial — the transaction must be signed client-side.");
  }
}

export async function getUserSigner(userId: string): Promise<UserSigner> {
  const wallet = await prisma.wallet.findUniqueOrThrow({ where: { userId } });
  return {
    publicKey: wallet.publicKey,
    mode: "custodial",
    getSecret: async () => decryptSecret(wallet.secretKey),
  };
}
