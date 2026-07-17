import "server-only";
import { headers } from "next/headers";
import { NextResponse } from "next/server";

/**
 * Sliding-window rate limiter with a pluggable store.
 *
 * The default store is in-memory (per serverless instance). That still blunts
 * brute-force and abuse meaningfully on warm instances; production-at-scale
 * swaps `store` for a Redis/Upstash implementation without touching call
 * sites — the interface is the contract.
 */

export interface RateLimitStore {
  /** Record a hit and return how many hits remain in the window. */
  hit(key: string, limit: number, windowMs: number): Promise<{ allowed: boolean; retryAfterSec: number }>;
}

class MemoryStore implements RateLimitStore {
  private buckets = new Map<string, number[]>();

  async hit(key: string, limit: number, windowMs: number) {
    const now = Date.now();
    const cutoff = now - windowMs;
    const hits = (this.buckets.get(key) ?? []).filter((t) => t > cutoff);
    if (hits.length >= limit) {
      const retryAfterSec = Math.max(1, Math.ceil((hits[0] + windowMs - now) / 1000));
      this.buckets.set(key, hits);
      return { allowed: false, retryAfterSec };
    }
    hits.push(now);
    this.buckets.set(key, hits);
    // opportunistic cleanup so the map can't grow unbounded
    if (this.buckets.size > 10_000) {
      for (const [k, v] of this.buckets) {
        if (v.every((t) => t <= cutoff)) this.buckets.delete(k);
      }
    }
    return { allowed: true, retryAfterSec: 0 };
  }
}

const store: RateLimitStore = new MemoryStore();

async function clientIp(): Promise<string> {
  const h = await headers();
  return (
    h.get("x-forwarded-for")?.split(",")[0]?.trim() ||
    h.get("x-real-ip") ||
    "unknown"
  );
}

export const LIMITS = {
  /** Login/register: strict — brute-force surface. */
  auth: { limit: 8, windowMs: 60_000 },
  /** On-chain financial mutations: tight but demo-friendly. */
  financial: { limit: 12, windowMs: 60_000 },
  /** General authenticated API traffic. */
  general: { limit: 90, windowMs: 60_000 },
} as const;

/**
 * Enforce a rate limit for the calling request. Returns a 429 response when
 * exceeded, or null when allowed.
 */
export async function rateLimit(
  bucket: keyof typeof LIMITS,
  discriminator?: string,
): Promise<NextResponse | null> {
  const { limit, windowMs } = LIMITS[bucket];
  const key = `${bucket}:${discriminator ?? (await clientIp())}`;
  const res = await store.hit(key, limit, windowMs);
  if (res.allowed) return null;
  return NextResponse.json(
    { error: "Too many requests — please wait a moment and try again." },
    { status: 429, headers: { "Retry-After": String(res.retryAfterSec) } },
  );
}
