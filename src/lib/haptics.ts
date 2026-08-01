/**
 * Haptic feedback for the moments that matter — a code locking on, a payment
 * landing, a payment failing. Silently does nothing where the Vibration API is
 * unavailable (iOS Safari, most desktops), so callers never have to check.
 */

type Pattern = "tap" | "success" | "warning" | "error";

const PATTERNS: Record<Pattern, number | number[]> = {
  tap: 12,
  success: [18, 60, 28],
  warning: [24, 50, 24],
  error: [40, 70, 40, 70, 60],
};

export function haptic(pattern: Pattern = "tap"): void {
  if (typeof navigator === "undefined" || typeof navigator.vibrate !== "function") return;
  try {
    navigator.vibrate(PATTERNS[pattern]);
  } catch {
    /* some browsers throw without a prior user gesture — ignore */
  }
}
