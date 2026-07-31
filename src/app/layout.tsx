import type { Metadata, Viewport } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import { ThemeProvider } from "@/components/theme-provider";
import { MotionProvider } from "@/components/motion-provider";
import { Toaster } from "@/components/ui/sonner";

const geistSans = Geist({ variable: "--font-geist-sans", subsets: ["latin"] });
const geistMono = Geist_Mono({ variable: "--font-geist-mono", subsets: ["latin"] });

// Stable production URL when deployed on Vercel; per-deployment URL as a
// fallback; localhost in dev. Fixes OG/Twitter image resolution.
const appUrl = process.env.NEXT_PUBLIC_APP_URL
  ? process.env.NEXT_PUBLIC_APP_URL
  : process.env.VERCEL_PROJECT_PRODUCTION_URL
    ? `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}`
    : process.env.VERCEL_URL
      ? `https://${process.env.VERCEL_URL}`
      : "http://localhost:3000";

export const metadata: Metadata = {
  metadataBase: new URL(appUrl),
  title: "RemitWise — Send More. Save Smarter. Live Better.",
  description:
    "RemitWise turns every remittance into an opportunity to build financial security — automatic savings, goals, and AI-powered guidance on Stellar.",
  applicationName: "RemitWise",
  keywords: [
    "remittance",
    "savings",
    "Stellar",
    "USDC",
    "fintech",
    "OFW",
    "financial wellness",
  ],
  appleWebApp: {
    capable: true,
    title: "RemitWise",
    statusBarStyle: "black-translucent",
  },
  openGraph: {
    title: "RemitWise",
    description: "Send More. Save Smarter. Live Better.",
    type: "website",
    images: [{ url: "/logo.png", width: 1254, height: 1254, alt: "RemitWise" }],
  },
  // Favicon + Apple touch icon are provided by src/app/{favicon.ico,icon.png,apple-icon.png}
  // (Next.js file conventions) — generated from the RemitWise logo mark.
};

export const viewport: Viewport = {
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#ffffff" },
    { media: "(prefers-color-scheme: dark)", color: "#0b1220" },
  ],
  viewportFit: "cover",
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body
        className={`${geistSans.variable} ${geistMono.variable} font-sans antialiased`}
      >
        <ThemeProvider
          attribute="class"
          defaultTheme="dark"
          enableSystem
          disableTransitionOnChange
        >
          <MotionProvider>
            {children}
            <Toaster />
          </MotionProvider>
        </ThemeProvider>
      </body>
    </html>
  );
}
