"use client";

import { useState } from "react";
import { Mascot } from "@/components/mascot";
import { Button } from "@/components/ui/button";
import { authClient } from "@/lib/auth-client";

/** Production mode's sign-in: Sign in with Vercel, for members of the project's team. */
export function SignInWithVercel() {
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const signIn = async () => {
    setPending(true);
    setError(null);
    try {
      const result = await authClient.signIn.social({
        callbackURL: window.location.pathname,
        provider: "vercel",
      });
      if (!result.error) {
        return;
      }
    } catch {
      // Reported below.
    }
    setPending(false);
    setError("Sign-in failed. Try again.");
  };

  return (
    <main className="bg-background flex min-h-svh flex-col items-center justify-center gap-6 p-6 text-center">
      <Mascot kind="skipper" mood="idle" size={88} />
      <div className="space-y-1">
        <h1 className="text-lg font-semibold">Lopsi Bot</h1>
        <p className="text-muted-foreground text-sm">
          Your crew, for members of this project's Vercel team.
        </p>
      </div>
      <div className="flex w-full max-w-xs flex-col gap-3">
        <Button disabled={pending} onClick={signIn}>
          {pending ? "Redirecting…" : "Continue with Vercel"}
        </Button>
        {error === null ? null : (
          <p className="text-destructive text-sm" role="alert">
            {error}
          </p>
        )}
      </div>
    </main>
  );
}
