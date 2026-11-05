import { cookies, headers } from "next/headers";
import type { Account } from "@/app/_components/account";
import { ACCESS_COOKIE, accessMode, verifyAccessToken } from "./access";
import { auth, isTrustedHost } from "./auth";
import { isDemo } from "./demo";

/**
 * Who is making this request, read on the server from the mode and the
 * browser's session or cookie:
 *
 * - an {@link Account} when they're signed in (or nobody needs to be: local development);
 * - `"sign-in-with-vercel"` when production mode needs them to sign in;
 * - `"login"` when starter mode needs the password, or the deployment is locked;
 * - `"unknown-address"` when production mode can't trust this address yet.
 */
export async function currentAccount(): Promise<
  Account | "sign-in-with-vercel" | "login" | "unknown-address"
> {
  if (isDemo) {
    return { kind: "demo" };
  }

  const mode = accessMode();

  if (
    mode === "open" ||
    ((mode === "vercel" || mode === "incomplete") &&
      process.env.NODE_ENV === "development")
  ) {
    return { kind: "open" };
  }

  if (mode === "vercel") {
    const requestHeaders = await headers();
    if (!isTrustedHost(requestHeaders.get("host"))) {
      return "unknown-address";
    }
    const session = await auth.api.getSession({ headers: requestHeaders });
    if (!session) {
      return "sign-in-with-vercel";
    }
    return {
      email: session.user.email,
      id: session.user.id,
      kind: "vercel",
      name: session.user.name,
      ...(session.user.image ? { image: session.user.image } : {}),
    };
  }

  const token = (await cookies()).get(ACCESS_COOKIE)?.value;
  if (mode === "password" && (await verifyAccessToken(token))) {
    return { kind: "password" };
  }
  return "login";
}
