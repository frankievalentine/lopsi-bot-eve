"use client";

import { AlertCircleIcon, Loader2Icon } from "lucide-react";
import { useActionState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { signInWithPassword } from "./actions";

export function PasswordForm({ redirectTo }: { readonly redirectTo: string }) {
  const [error, formAction, pending] = useActionState(signInWithPassword, null);

  return (
    <form action={formAction} className="flex flex-col gap-3">
      <input name="redirect" type="hidden" value={redirectTo} />
      <Input
        aria-invalid={error !== null}
        aria-label="Password"
        autoComplete="current-password"
        autoFocus
        disabled={pending}
        name="password"
        placeholder="Password"
        type="password"
      />
      {error === null ? null : (
        <p
          className="text-destructive flex items-center gap-2 text-sm"
          role="alert"
        >
          <AlertCircleIcon className="size-4" />
          {error}
        </p>
      )}
      <Button disabled={pending} type="submit">
        {pending ? <Loader2Icon className="animate-spin" /> : null}
        Continue
      </Button>
    </form>
  );
}
