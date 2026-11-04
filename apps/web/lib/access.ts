/**
 * Starter-mode access: one shared password for the whole crew.
 *
 * The web app checks the password and stores a signed token in an httpOnly
 * cookie; each agent's eve channel verifies that cookie on every request. Both
 * read the same `LOPSI_ACCESS_PASSWORD`, and the signing key is derived from
 * it, so there is no database and changing the password signs everyone out.
 *
 * Everyone with the password is the same principal, `lopsi:operator`, so they
 * share sessions and connection grants. Per-person identity comes with
 * production mode (Sign in with Vercel, `lib/auth.ts`), which takes precedence
 * whenever it is configured.
 *
 * Adapted from vercel-labs/eve-tanstack-start-template (MIT); see NOTICE.
 *
 * @packageDocumentation
 */

import { createHmac, timingSafeEqual } from "node:crypto";
import type { AuthFn, VerifyJwtHmacConfig } from "eve/channels/auth";
import { UnauthenticatedError, verifyJwtHmac } from "eve/channels/auth";
import type { SessionAuthContext } from "eve/context";

import { isVercelSignInConfigured } from "./auth";
import { isSessionOwnerStoreConfigured } from "./session-owners";

/**
 * How this deployment admits people, in precedence order:
 *
 * - `vercel`: Sign in with Vercel, limited to the project's team, with each chat kept to its owner.
 * - `incomplete`: Sign in with Vercel is set up but the chat owner store isn't; nobody gets in.
 * - `password`: starter mode, a usable `LOPSI_ACCESS_PASSWORD`.
 * - `too-short`: a password is set but shorter than 16 characters; nobody gets in.
 * - `open`: local development with neither configured.
 * - `unconfigured`: a deployment with neither configured; nobody gets in.
 */
export type AccessMode =
  | "vercel"
  | "incomplete"
  | "password"
  | "too-short"
  | "open"
  | "unconfigured";

/**
 * Resolves this deployment's {@link AccessMode} from its environment.
 *
 * @returns The access mode.
 */
export function accessMode(): AccessMode {
  if (isVercelSignInConfigured) {
    return isSessionOwnerStoreConfigured() ? "vercel" : "incomplete";
  }
  if (accessPassword() !== undefined) {
    return "password";
  }
  if (isAccessPasswordTooShort()) {
    return "too-short";
  }
  return process.env.NODE_ENV === "development" ? "open" : "unconfigured";
}

/** Name of the httpOnly cookie that holds the access token. */
export const ACCESS_COOKIE = "lopsi_access";

/** How long an access token (and its cookie) stays valid: 30 days. */
export const ACCESS_TOKEN_TTL_SECONDS = 60 * 60 * 24 * 30;

/** Shortest password accepted; a shorter one leaves the deployment locked. */
const MIN_PASSWORD_LENGTH = 16;

/** The single principal every starter-mode visitor acts as. */
const OPERATOR_SUBJECT = "lopsi:operator";

const ISSUER = "lopsi-web";

/**
 * Every starter-mode caller, spelled out rather than taken from the token's
 * claims, so the dashboard can name the same Vercel Connect grant the agent uses.
 */
export const OPERATOR: SessionAuthContext = {
  attributes: {},
  authenticator: "access-password",
  issuer: ISSUER,
  principalId: OPERATOR_SUBJECT,
  principalType: "user",
  subject: OPERATOR_SUBJECT,
};
const AUDIENCE = "eve";

/**
 * Reads the configured access password.
 *
 * @returns `LOPSI_ACCESS_PASSWORD` when it is at least {@link MIN_PASSWORD_LENGTH}
 * characters, otherwise `undefined`. Always `undefined` while Sign in with
 * Vercel is configured, so a leftover password admits nobody.
 */
function accessPassword(): string | undefined {
  const password = process.env.LOPSI_ACCESS_PASSWORD;
  return isVercelSignInConfigured ||
    password === undefined ||
    password.length < MIN_PASSWORD_LENGTH
    ? undefined
    : password;
}

/**
 * Reports whether a password is set but too short to be accepted.
 *
 * @returns `true` when `LOPSI_ACCESS_PASSWORD` is non-empty and shorter than
 * {@link MIN_PASSWORD_LENGTH}.
 */
function isAccessPasswordTooShort(): boolean {
  const password = process.env.LOPSI_ACCESS_PASSWORD;
  return (
    password !== undefined &&
    password !== "" &&
    password.length < MIN_PASSWORD_LENGTH
  );
}

/**
 * Derives the token signing key from the password, so no separate secret is needed.
 *
 * @param password - The configured access password.
 * @returns A base64url HMAC-SHA256 key.
 */
function signingKey(password: string): string {
  return createHmac("sha256", password)
    .update("lopsi-access-token:v1")
    .digest("base64url");
}

/**
 * Builds the verifier config matching the tokens {@link signAccessToken} mints.
 *
 * @param password - The configured access password.
 * @returns Config for `verifyJwtHmac`.
 */
function tokenConfig(password: string): VerifyJwtHmacConfig {
  return {
    algorithm: "HS256",
    audiences: [AUDIENCE],
    issuer: ISSUER,
    secret: signingKey(password),
  };
}

/**
 * Reports whether this deployment has a usable access password.
 *
 * @returns `true` when `LOPSI_ACCESS_PASSWORD` is set and long enough.
 */
function isAccessConfigured(): boolean {
  return accessPassword() !== undefined;
}

/**
 * Hashes a password to a fixed length so `timingSafeEqual` can compare values of any length.
 *
 * @param value - The password to hash.
 * @returns The HMAC-SHA256 digest.
 */
function compareDigest(value: string): Buffer {
  return createHmac("sha256", "lopsi-access-compare").update(value).digest();
}

/**
 * Compares a submitted password with the configured one in constant time.
 *
 * @param candidate - The password a visitor entered.
 * @returns `true` on a match; always `false` when no usable password is configured.
 */
export function checkAccessPassword(candidate: string): boolean {
  const password = accessPassword();
  if (password === undefined) {
    return false;
  }
  return timingSafeEqual(compareDigest(candidate), compareDigest(password));
}

/** Claims carried by an access token. */
interface AccessTokenClaims {
  readonly aud: string;
  readonly exp: number;
  readonly iat: number;
  readonly iss: string;
  readonly sub: string;
}

/**
 * Encodes one JWT segment.
 *
 * @param segment - The JWT header or claims.
 * @returns The base64url-encoded JSON.
 */
function encodeSegment(
  segment: AccessTokenClaims | { readonly alg: "HS256"; readonly typ: "JWT" }
): string {
  return Buffer.from(JSON.stringify(segment)).toString("base64url");
}

/**
 * Mints an HS256 JWT for the operator principal.
 *
 * @returns The signed token, valid for {@link ACCESS_TOKEN_TTL_SECONDS}.
 * @throws {@link Error} When no usable `LOPSI_ACCESS_PASSWORD` is set.
 */
export function signAccessToken(): string {
  const password = accessPassword();
  if (password === undefined) {
    throw new Error("LOPSI_ACCESS_PASSWORD is not set.");
  }
  const now = Math.floor(Date.now() / 1000);
  const body = `${encodeSegment({ alg: "HS256", typ: "JWT" })}.${encodeSegment({
    aud: AUDIENCE,
    exp: now + ACCESS_TOKEN_TTL_SECONDS,
    iat: now,
    iss: ISSUER,
    sub: OPERATOR_SUBJECT,
  })}`;
  const signature = createHmac("sha256", signingKey(password))
    .update(body)
    .digest("base64url");
  return `${body}.${signature}`;
}

/**
 * Verifies a token minted by {@link signAccessToken} against the current password.
 *
 * @param token - The raw token, usually read from {@link ACCESS_COOKIE}.
 * @returns The operator's auth context, or `undefined` when the token is missing,
 * invalid, expired, or no usable password is configured.
 */
export async function verifyAccessToken(
  token: string | undefined
): Promise<SessionAuthContext | undefined> {
  const password = accessPassword();
  if (password === undefined || token === undefined || token === "") {
    return;
  }
  const result = await verifyJwtHmac(token, tokenConfig(password));
  return result.ok ? OPERATOR : undefined;
}

/**
 * Reads one cookie from a `Cookie` request header.
 *
 * @param header - The raw `Cookie` header value.
 * @param name - The cookie to find.
 * @returns The decoded cookie value, or `undefined` when absent or malformed.
 */
function readCookie(header: string | null, name: string): string | undefined {
  for (const pair of header?.split(";") ?? []) {
    const [key, ...value] = pair.trim().split("=");
    if (key === name) {
      try {
        return decodeURIComponent(value.join("="));
      } catch {
        return;
      }
    }
  }
}

/**
 * Route auth for the access cookie. Place it after `localDev()` and before
 * `placeholderAuth()`.
 *
 * @returns An `AuthFn` that accepts same-origin requests with a valid access
 * cookie, and skips (returns `null`) when no usable password is configured so
 * `placeholderAuth()` rejects the request instead.
 * @throws {@link UnauthenticatedError} From the returned `AuthFn`, with code
 * `access_required`, when a password is set but the cookie is missing, invalid,
 * or sent cross-site. The chat turns this 401 into a sign-in redirect.
 */
export function accessCookieAuth(): AuthFn {
  return async (request) => {
    if (!isAccessConfigured()) {
      return null;
    }
    const crossSite =
      request.headers.has("origin") &&
      request.headers.get("sec-fetch-site") !== "same-origin";
    const sessionAuth = crossSite
      ? undefined
      : await verifyAccessToken(
          readCookie(request.headers.get("cookie"), ACCESS_COOKIE)
        );
    if (sessionAuth) {
      return sessionAuth;
    }
    throw new UnauthenticatedError({
      code: "access_required",
      message: "Enter the access password to continue.",
    });
  };
}
