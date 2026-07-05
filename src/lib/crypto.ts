import "server-only";
import { deriveKey, encryptWithKey, decryptWithKey } from "@/lib/crypto-core";
import { env } from "@/lib/env";

/**
 * Authenticated encryption (AES-256-GCM) for data at rest — specifically the
 * Stellar wallet secret keys, so they're never stored in plaintext.
 *
 * NOTE: a real custodial product would use a dedicated KMS/HSM; this removes
 * plaintext secrets from the database (the critical finding). The non-custodial
 * path (Freighter) removes secret storage entirely.
 */
const KEY = deriveKey(env.walletEncryptionKey);

export function encryptSecret(plaintext: string): string {
  return encryptWithKey(KEY, plaintext);
}

export function decryptSecret(payload: string): string {
  return decryptWithKey(KEY, payload);
}
