"use client";

import { Mascot } from "@/components/mascot";
import { Button } from "@/components/ui/button";

/** A page that failed to render, with a way to try it again. */
export default function ErrorPage({
  reset,
}: {
  readonly error: Error;
  readonly reset: () => void;
}) {
  return (
    <main
      className="bg-background flex min-h-svh flex-col items-center justify-center gap-6 p-6 text-center"
      id="main"
    >
      <Mascot kind="skipper" mood="needs" size={88} />
      <div className="space-y-1">
        <h1 className="text-lg font-semibold">Something Went Wrong</h1>
        <p className="text-muted-foreground text-sm">
          This page didn't load. Try again, and if it keeps failing, check the
          deployment's logs.
        </p>
      </div>
      <Button onClick={reset}>Try Again</Button>
    </main>
  );
}
