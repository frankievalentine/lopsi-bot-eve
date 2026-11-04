"use client";

import { ClientError } from "eve/client";
import { useEffect } from "react";
import { signInDestination } from "@/app/login/actions";

/**
 * Sends the browser to sign in when the agent rejects it with a 401 and the
 * browser has lost access, for example because its session expired or the
 * starter password changed. Pages check access on load; this covers a chat
 * that was already open.
 *
 * @param error - The agent's current error, from `useEveAgent`.
 */
export function useSignInRedirect(error: Error | undefined): void {
  const isUnauthenticated =
    error instanceof ClientError && error.status === 401;
  useEffect(() => {
    if (!isUnauthenticated) {
      return;
    }
    let isCurrent = true;
    const redirectIfSignedOut = async () => {
      const destination = await signInDestination(
        window.location.pathname + window.location.search
      );
      if (isCurrent && destination !== null) {
        window.location.assign(destination);
      }
    };
    redirectIfSignedOut().catch(() => undefined);
    return () => {
      isCurrent = false;
    };
  }, [isUnauthenticated]);
}
