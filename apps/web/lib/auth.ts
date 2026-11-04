import { randomBytes } from "node:crypto";
import { betterAuth } from "better-auth";

const SESSION_MAX_AGE_SECONDS = 8 * 60 * 60;
const DEVELOPMENT_ALLOWED_HOSTS = ["localhost:*", "127.0.0.1:*"];

/** Written by `eve add channel/web` when it sets up Sign in with Vercel. */
const SIGN_IN_VARIABLES = [
  "VERCEL_APP_CLIENT_ID",
  "VERCEL_APP_CLIENT_SECRET",
  "BETTER_AUTH_SECRET",
] as const;

/**
 * Whether Sign in with Vercel has all of its credentials. Without them the
 * deployment falls back to starter mode (`lib/access.ts`) instead of failing.
 */
export const isVercelSignInConfigured = SIGN_IN_VARIABLES.every((name) =>
  Boolean(process.env[name])
);

function getAllowedHosts(): string[] {
  if (process.env.NODE_ENV === "development") {
    return DEVELOPMENT_ALLOWED_HOSTS;
  }
  const deploymentHosts = [
    process.env.VERCEL_URL,
    process.env.VERCEL_BRANCH_URL,
    process.env.VERCEL_PROJECT_PRODUCTION_URL,
  ].filter((host): host is string => Boolean(host));
  // Unconfigured, the instance is never used, so it trusts only a reserved host
  // that never resolves, and a local `next build` (which has no deployment
  // hosts) still succeeds.
  if (!isVercelSignInConfigured) {
    return ["unconfigured.invalid"];
  }
  if (deploymentHosts.length === 0) {
    throw new Error("No trusted deployment hosts are configured");
  }
  return Array.from(new Set(deploymentHosts));
}

function signInVariable(name: (typeof SIGN_IN_VARIABLES)[number]): string {
  const value = process.env[name];
  if (value) {
    return value;
  }
  // Unconfigured (and in local development, which needs no sign-in): a
  // throwaway value, so no session this instance could mint or read is ever
  // valid. 32 random bytes also keep Better Auth's secret-length check quiet.
  // Callers check `isVercelSignInConfigured` first.
  return randomBytes(32).toString("base64url");
}

export const auth = betterAuth({
  baseURL: {
    allowedHosts: getAllowedHosts(),
    protocol: process.env.NODE_ENV === "development" ? "auto" : "https",
  },
  secret: signInVariable("BETTER_AUTH_SECRET"),
  session: {
    cookieCache: {
      enabled: true,
      maxAge: SESSION_MAX_AGE_SECONDS,
      refreshCache: false,
      strategy: "jwe",
    },
    disableSessionRefresh: true,
    expiresIn: SESSION_MAX_AGE_SECONDS,
  },
  socialProviders: {
    vercel: {
      clientId: signInVariable("VERCEL_APP_CLIENT_ID"),
      clientSecret: signInVariable("VERCEL_APP_CLIENT_SECRET"),
      scope: ["openid", "email", "profile"],
    },
  },
});
