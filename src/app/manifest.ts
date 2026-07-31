import type { MetadataRoute } from "next";

/**
 * PWA manifest — makes RemitWise installable on the phones our users
 * actually live on. Icons: 512px (public/) + Apple touch icon handled by
 * the app-router file convention (src/app/apple-icon.png).
 */
export default function manifest(): MetadataRoute.Manifest {
  return {
    id: "/",
    name: "RemitWise — Send More. Save Smarter.",
    short_name: "RemitWise",
    description:
      "Remittances that build savings: automatic on-chain auto-save, goals, and cash-out to PH banks — powered by Stellar.",
    start_url: "/dashboard",
    display: "standalone",
    orientation: "portrait",
    background_color: "#0b1220",
    theme_color: "#0b1220",
    categories: ["finance", "productivity"],
    icons: [
      { src: "/icon-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
    ],
    shortcuts: [
      { name: "Dashboard", url: "/dashboard" },
      { name: "Activity", url: "/dashboard/activity" },
    ],
  };
}
