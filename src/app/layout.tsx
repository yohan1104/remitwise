import type { Metadata, Viewport } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import { ThemeProvider } from "@/components/theme-provider";
import { Toaster } from "@/components/ui/sonner";

const geistSans = Geist({ variable: "--font-geist-sans", subsets: ["latin"] });
const geistMono = Geist_Mono({ variable: "--font-geist-mono", subsets: ["latin"] });

export const metadata: Metadata = {
  title: "RemitWise — Send More. Save Smarter. Live Better.",
  description:
    "RemitWise turns every remittance into an opportunity to build financial security — automatic savings, goals, and AI-powered guidance on Stellar.",
  keywords: [
    "remittance",
    "savings",
    "Stellar",
    "USDC",
    "fintech",
    "OFW",
    "financial wellness",
  ],
  openGraph: {
    title: "RemitWise",
    description: "Send More. Save Smarter. Live Better.",
    type: "website",
    images: [{ url: "/logo.png", width: 1260, height: 1260, alt: "RemitWise" }],
  },
  icons: {
    icon: [{ url: "/logo.png", type: "image/png" }],
    apple: "/logo.png",
  },
};

export const viewport: Viewport = {
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#ffffff" },
    { media: "(prefers-color-scheme: dark)", color: "#0b1220" },
  ],
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
          {children}
          <Toaster />
        </ThemeProvider>
      </body>
    </html>
  );
}
