"use server";

import { cookies, headers } from "next/headers";
import { redirect } from "next/navigation";
import {
  ACCESS_COOKIE,
  ACCESS_TOKEN_TTL_SECONDS,
  accessMode,
  checkAccessPassword,
  signAccessToken,
  verifyAccessToken,
} from "@/lib/access";
import { auth, isTrustedHost } from "@/lib/auth";
import {
  clearFailures,
  isLockedOut,
  recordFailure,
} from "@/lib/password-attempts";
import { safeRedirect } from "./safe-redirect";

/**
 * Starter-mode sign-in, for `useActionState`: on a matching password it sets
 * the access cookie and redirects to the form's `redirect` field.
 *
 * @param _previous - The previous error message, unused.
 * @param form - The submitted form: `password` and `redirect`.
 * @returns An error message to show, or never returns on success.
 */
export async function signInWithPassword(
  _previous: string | null,
  form: FormData
): Promise<string | null> {
  const password = form.get("password");
  if (
    typeof password !== "string" ||
    password === "" ||
    password.length > 1024
  ) {
    return null;
  }
  // Vercel sets this header itself, so a visitor can't choose their address.
  const address =
    (await headers()).get("x-forwarded-for")?.split(",")[0]?.trim() ??
    "unknown";
  if (isLockedOut(address)) {
    return "Too many attempts. Wait 15 minutes, then try again.";
  }
  if (!checkAccessPassword(password)) {
    recordFailure(address);
    return "Incorrect password. Check it with whoever shared it.";
  }
  clearFailures(address);
  (await cookies()).set(ACCESS_COOKIE, signAccessToken(), {
    httpOnly: true,
    maxAge: ACCESS_TOKEN_TTL_SECONDS,
    path: "/",
    sameSite: "lax",
    secure: process.env.NODE_ENV !== "development",
  });
  const target = form.get("redirect");
  redirect(safeRedirect(typeof target === "string" ? target : null));
}

/** Starter-mode sign-out: drops this browser's access cookie. */
export async function signOutOfPassword(): Promise<void> {
  (await cookies()).delete(ACCESS_COOKIE);
  redirect("/login");
}

/**
 * Where a browser whose agent requests started failing with 401 should go to
 * sign in again.
 *
 * @param path - The page the browser is on.
 * @returns The sign-in destination, or `null` when the browser still has access.
 */
export async function signInDestination(path: string): Promise<string | null> {
  const mode = accessMode();
  if (mode === "open") {
    return null;
  }
  if (mode === "vercel") {
    const requestHeaders = await headers();
    // The page itself explains an address it can't trust yet.
    if (!isTrustedHost(requestHeaders.get("host"))) {
      return safeRedirect(path);
    }
    const session = await auth.api.getSession({ headers: requestHeaders });
    // The page itself shows Sign in with Vercel when there is no session.
    return session ? null : safeRedirect(path);
  }
  if (
    mode === "password" &&
    (await verifyAccessToken((await cookies()).get(ACCESS_COOKIE)?.value))
  ) {
    return null;
  }
  return `/login?redirect=${encodeURIComponent(safeRedirect(path))}`;
}
