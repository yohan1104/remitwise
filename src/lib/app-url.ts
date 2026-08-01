/**
 * The origin RemitWise is being served from.
 *
 * Explicit configuration wins (NEXT_PUBLIC_APP_URL, then Vercel's stable
 * production URL, then the per-deployment URL). When none is set — local dev,
 * preview tunnels, a self-hosted box behind a proxy — we fall back to the
 * request's own host so links we hand out (QR payment codes in particular)
 * always point back at the host the user is actually on.
 */

const CONFIGURED =
  process.env.NEXT_PUBLIC_APP_URL ||
  (process.env.VERCEL_PROJECT_PRODUCTION_URL
    ? `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}`
    : process.env.VERCEL_URL
      ? `https://${process.env.VERCEL_URL}`
      : "");

export function appOrigin(req?: Request): string {
  if (CONFIGURED) return CONFIGURED.replace(/\/+$/, "");
  if (req) {
    const forwardedHost = req.headers.get("x-forwarded-host");
    const host = forwardedHost || req.headers.get("host");
    if (host) {
      const proto =
        req.headers.get("x-forwarded-proto") ??
        (host.startsWith("localhost") || host.startsWith("127.0.0.1") ? "http" : "https");
      return `${proto}://${host}`;
    }
    try {
      return new URL(req.url).origin;
    } catch {
      /* fall through */
    }
  }
  return "http://localhost:3000";
}
