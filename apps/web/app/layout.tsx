import type { Metadata, Viewport } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import type { ReactNode } from "react";
import { TooltipProvider } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";
import "./globals.css";

const sans = Geist({
  display: "swap",
  subsets: ["latin"],
  variable: "--font-geist-sans",
  weight: "variable",
});

const mono = Geist_Mono({
  display: "swap",
  subsets: ["latin"],
  variable: "--font-geist-mono",
  weight: "variable",
});

export const metadata: Metadata = {
  description: "A crew of eve agents with the Lopsi dashboard.",
  // The SVG icon is swapped at runtime to show the crew (lib/favicon.tsx).
  icons: {
    apple: "/apple-touch-icon.png",
    icon: [
      { sizes: "32x32", url: "/favicon.ico" },
      { type: "image/svg+xml", url: "/favicon.svg" },
    ],
  },
  title: "Lopsi Bot",
  twitter: { card: "summary_large_image" },
};

export const viewport: Viewport = {
  // Where supported, the keyboard shrinks the page, keeping the composer above it.
  interactiveWidget: "resizes-content",
  themeColor: [
    { color: "#ffffff", media: "(prefers-color-scheme: light)" },
    { color: "#0a0a0a", media: "(prefers-color-scheme: dark)" },
  ],
};

export default function RootLayout({
  children,
}: {
  readonly children: ReactNode;
}) {
  return (
    <html className={cn(sans.variable, mono.variable)} lang="en">
      <body>
        <a
          className="bg-background focus-visible:ring-ring/50 sr-only z-50 rounded-md border px-3 py-2 text-sm focus-visible:not-sr-only focus-visible:fixed focus-visible:top-2 focus-visible:left-2 focus-visible:ring-3"
          href="#main"
        >
          Skip to Content
        </a>
        <TooltipProvider>{children}</TooltipProvider>
      </body>
    </html>
  );
}
