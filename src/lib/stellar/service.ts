import "server-only";
import { Keypair, StrKey } from "@stellar/stellar-sdk";
import { prisma } from "@/lib/prisma";
import { env } from "@/lib/env";
import { encryptSecret, decryptSecret } from "@/lib/crypto";
import { provisionWallet, getWalletState } from "./soroban";

export interface GeneratedKeypair {
  publicKey: string;
  secretKey: string;
}

export function generateKeypair(): GeneratedKeypair {
  const kp = Keypair.random();
  return { publicKey: kp.publicKey(), secretKey: kp.secret() };
}

export function isValidSecret(secret: string): boolean {
  return StrKey.isValidEd25519SecretSeed(secret.trim());
}

/** Create a wallet row with an encrypted secret. Provisioning happens later. */
export async function createWalletForUser(userId: string) {
  const { publicKey, secretKey } = generateKeypair();
  return prisma.wallet.create({
    data: {
      userId,
      publicKey,
      secretKey: encryptSecret(secretKey),
      network: env.stellarNetwork,
      provisioned: false,
    },
  });
}

export async function importWalletForUser(userId: string, secret: string) {
  if (!isValidSecret(secret)) {
    throw new Error("That doesn't look like a valid Stellar secret key.");
  }
  const publicKey = Keypair.fromSecret(secret.trim()).publicKey();
  return prisma.wallet.upsert({
    where: { userId },
    update: { publicKey, secretKey: encryptSecret(secret.trim()), provisioned: false },
    create: {
      userId,
      publicKey,
      secretKey: encryptSecret(secret.trim()),
      network: env.stellarNetwork,
      provisioned: false,
    },
  });
}

/** Decrypt a user's wallet secret for signing on-chain transactions. */
export async function getWalletSecret(userId: string): Promise<string> {
  const wallet = await prisma.wallet.findUniqueOrThrow({ where: { userId } });
  return decryptSecret(wallet.secretKey);
}

/**
 * Fund the wallet via Friendbot and establish its USDC trustline so it can
 * receive on-chain remittances. Idempotent — safe to call repeatedly.
 */
export async function provisionWalletForUser(userId: string): Promise<{ funded: boolean; trustline: boolean }> {
  const wallet = await prisma.wallet.findUniqueOrThrow({ where: { userId } });
  if (wallet.provisioned) return { funded: true, trustline: true };

  const secret = decryptSecret(wallet.secretKey);
  const result = await provisionWallet(secret);
  if (result.trustline) {
    await prisma.wallet.update({ where: { userId }, data: { provisioned: true } });
  }
  return result;
}

/** Live on-chain state for a wallet (funded, trustline, USDC, XLM). */
export async function getOnChainWalletState(publicKey: string) {
  return getWalletState(publicKey);
}
