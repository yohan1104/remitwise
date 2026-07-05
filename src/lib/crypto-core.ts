/**
 * Pure AES-256-GCM helpers (no env, no `server-only`) so both the app runtime
 * and standalone scripts (seed/bootstrap) encrypt/decrypt identically.
 */
import { createCipheriv, createDecipheriv, randomBytes, scryptSync } from "node:crypto";

export function deriveKey(secret: string): Buffer {
  return scryptSync(secret, "remitwise.wallet.v1", 32);
}

export function encryptWithKey(key: Buffer, plaintext: string): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key, iv);
  const enc = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return `v1:${iv.toString("base64")}:${tag.toString("base64")}:${enc.toString("base64")}`;
}

export function decryptWithKey(key: Buffer, payload: string): string {
  if (!payload.startsWith("v1:")) return payload; // legacy plaintext
  const [, ivB64, tagB64, dataB64] = payload.split(":");
  const decipher = createDecipheriv("aes-256-gcm", key, Buffer.from(ivB64, "base64"));
  decipher.setAuthTag(Buffer.from(tagB64, "base64"));
  return Buffer.concat([
    decipher.update(Buffer.from(dataB64, "base64")),
    decipher.final(),
  ]).toString("utf8");
}
