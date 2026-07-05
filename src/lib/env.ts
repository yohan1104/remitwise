/**
 * Centralized, typed access to environment variables with fail-fast validation
 * for security-critical secrets.
 */

const isProd = process.env.NODE_ENV === "production";

function requireInProd(name: string, value: string | undefined, devFallback: string): string {
  if (value && value.length > 0) return value;
  if (isProd) {
    throw new Error(
      `Missing required environment variable ${name}. Refusing to start in production with an insecure default.`,
    );
  }
  return devFallback;
}

const authSecret = requireInProd(
  "AUTH_SECRET",
  process.env.AUTH_SECRET,
  "remitwise-insecure-dev-secret-change-me-0000000000000000",
);

export const env = {
  authSecret,
  // Falls back to AUTH_SECRET (already validated) so one strong secret suffices.
  walletEncryptionKey:
    process.env.WALLET_ENCRYPTION_KEY && process.env.WALLET_ENCRYPTION_KEY.length > 0
      ? process.env.WALLET_ENCRYPTION_KEY
      : authSecret,
  stellarNetwork: (process.env.STELLAR_NETWORK ?? "testnet") as "testnet" | "public",
  ai: {
    apiKey: process.env.AI_API_KEY ?? "",
    baseUrl: process.env.AI_API_BASE_URL ?? "https://api.openai.com/v1",
    model: process.env.AI_MODEL ?? "gpt-4o-mini",
    get enabled() {
      return Boolean(process.env.AI_API_KEY);
    },
  },
} as const;
