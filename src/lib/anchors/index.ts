import "server-only";
import type { AnchorProvider } from "./types";
import { MockAnchor } from "./mock";
import { Sep24Anchor } from "./sep24";

export type * from "./types";

/**
 * Anchor selection — configuration, not code.
 *
 *   ANCHOR_PROVIDER=mock   (default) simulated partner with realistic lifecycle
 *   ANCHOR_PROVIDER=sep24  real SEP-24 anchor; requires ANCHOR_HOME_DOMAIN
 *
 * Everything above this seam (engines, APIs, UI) is provider-agnostic.
 */
let instance: AnchorProvider | null = null;

export function getAnchor(): AnchorProvider {
  if (instance) return instance;
  const provider = process.env.ANCHOR_PROVIDER ?? "mock";
  if (provider === "sep24") {
    const domain = process.env.ANCHOR_HOME_DOMAIN;
    if (!domain) {
      throw new Error("ANCHOR_PROVIDER=sep24 requires ANCHOR_HOME_DOMAIN to be set.");
    }
    instance = new Sep24Anchor(domain);
  } else {
    instance = new MockAnchor();
  }
  return instance;
}
