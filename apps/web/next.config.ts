import type { NextConfig } from "next";

/**
 * Reported to the browser's console, not enforced, until it's been seen to leave
 * the dashboard working on real deployments.
 */
const CONTENT_SECURITY_POLICY = [
  "default-src 'self'",
  "base-uri 'self'",
  "connect-src 'self'",
  "font-src 'self' data:",
  "form-action 'self' https://vercel.com",
  "frame-ancestors 'none'",
  "img-src 'self' data: blob: https:",
  "object-src 'none'",
  "script-src 'self' 'unsafe-inline'",
  "style-src 'self' 'unsafe-inline'",
].join("; ");

const nextConfig: NextConfig = {
  headers: () =>
    Promise.resolve([
      {
        headers: [
          {
            key: "Content-Security-Policy-Report-Only",
            value: CONTENT_SECURITY_POLICY,
          },
          {
            key: "Permissions-Policy",
            value: "camera=(), geolocation=(), microphone=()",
          },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "X-Frame-Options", value: "DENY" },
        ],
        source: "/:path*",
      },
    ]),
};

export default nextConfig;
