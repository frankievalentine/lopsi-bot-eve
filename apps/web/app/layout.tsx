import type { Metadata } from "next";
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
};

export default function RootLayout({
  children,
}: {
  readonly children: ReactNode;
}) {
  return (
    <html className={cn(sans.variable, mono.variable)} lang="en">
      <body>
        <TooltipProvider>{children}</TooltipProvider>
      </body>
    </html>
  );
}
