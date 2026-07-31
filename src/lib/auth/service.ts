import "server-only";
import bcrypt from "bcryptjs";
import { prisma } from "@/lib/prisma";
import { createSession, destroySession, getSession } from "./session";
import { createWalletForUser } from "@/lib/stellar/service";
import { audit } from "@/lib/audit";
import { DEFAULT_SAVINGS_RATE } from "@/lib/constants";

export class AuthError extends Error {}

export interface PublicUser {
  id: string;
  email: string;
  name: string;
  savingsRate: number;
  onboarded: boolean;
}

function toPublic(u: {
  id: string;
  email: string;
  name: string;
  savingsRate: number;
  onboarded: boolean;
}): PublicUser {
  return {
    id: u.id,
    email: u.email,
    name: u.name,
    savingsRate: u.savingsRate,
    onboarded: u.onboarded,
  };
}

/**
 * Register a new user, provision a Stellar testnet wallet, and start a session.
 * A wallet is created eagerly so the dashboard is never empty on first login.
 */
export async function registerUser(input: {
  email: string;
  password: string;
  name: string;
}): Promise<PublicUser> {
  const email = input.email.trim().toLowerCase();
  const existing = await prisma.user.findUnique({ where: { email } });
  if (existing) throw new AuthError("An account with this email already exists.");

  const passwordHash = await bcrypt.hash(input.password, 10);
  const user = await prisma.user.create({
    data: {
      email,
      name: input.name.trim(),
      passwordHash,
      savingsRate: DEFAULT_SAVINGS_RATE,
      // New accounts finish the guided onboarding before reaching the dashboard.
      onboarded: false,
    },
  });

  await createWalletForUser(user.id);
  await createSession({ userId: user.id, email: user.email });
  await audit({ action: "auth.register", userId: user.id });
  return toPublic(user);
}

export async function loginUser(input: {
  email: string;
  password: string;
}): Promise<PublicUser> {
  const email = input.email.trim().toLowerCase();
  const user = await prisma.user.findUnique({ where: { email } });
  if (!user) throw new AuthError("Invalid email or password.");

  const ok = await bcrypt.compare(input.password, user.passwordHash);
  if (!ok) throw new AuthError("Invalid email or password.");

  await createSession({ userId: user.id, email: user.email });
  return toPublic(user);
}

export async function logoutUser(): Promise<void> {
  await destroySession();
}

/** Change the account password after verifying the current one. */
export async function changePassword(
  userId: string,
  input: { currentPassword: string; newPassword: string },
): Promise<void> {
  const user = await prisma.user.findUniqueOrThrow({ where: { id: userId } });
  const ok = await bcrypt.compare(input.currentPassword, user.passwordHash);
  if (!ok) throw new AuthError("Current password is incorrect.");
  const passwordHash = await bcrypt.hash(input.newPassword, 10);
  await prisma.user.update({ where: { id: userId }, data: { passwordHash } });
  await audit({ action: "auth.password_changed", userId });
}

/** Returns the authenticated user or null. Safe to call in server components. */
export async function getCurrentUser(): Promise<PublicUser | null> {
  const session = await getSession();
  if (!session) return null;
  const user = await prisma.user.findUnique({ where: { id: session.userId } });
  return user ? toPublic(user) : null;
}

/** Throws when unauthenticated — use inside protected API routes. */
export async function requireUser(): Promise<PublicUser> {
  const user = await getCurrentUser();
  if (!user) throw new AuthError("Not authenticated.");
  return user;
}
