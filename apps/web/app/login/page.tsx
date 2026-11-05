import type { Metadata } from "next";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { LMark } from "@/components/l-mark";
import { ACCESS_COOKIE, accessMode, verifyAccessToken } from "@/lib/access";
import { PasswordForm } from "./password-form";
import { safeRedirect } from "./safe-redirect";

export const metadata: Metadata = { title: "Sign In · Lopsi Bot" };

/** What a deployer does to open a locked deployment: a command or variable, and the rest of the sentence. */
const SETUP_STEPS: Record<
  "incomplete" | "too-short" | "unconfigured",
  readonly [string, string, string]
> = {
  incomplete: [
    "Run ",
    "pnpm setup:sign-in",
    " to finish production sign-in (it adds the store that keeps each chat to its owner), then redeploy.",
  ],
  "too-short": [
    "Make ",
    "LOPSI_ACCESS_PASSWORD",
    " at least 16 characters long in your Vercel project, then redeploy.",
  ],
  unconfigured: [
    "Set ",
    "LOPSI_ACCESS_PASSWORD",
    " in your Vercel project, then redeploy.",
  ],
};

function SetupNotice({ mode }: { readonly mode: keyof typeof SETUP_STEPS }) {
  const [before, code, after] = SETUP_STEPS[mode];
  return (
    <p className="bg-muted/40 text-muted-foreground rounded-lg border px-3 py-2.5 text-sm">
      {before}
      <code className="text-foreground font-mono">{code}</code>
      {after}
    </p>
  );
}

/**
 * Starter-mode sign-in. Production mode signs in on the chat page itself, so
 * this page only serves the shared password, or explains why nobody can sign in.
 */
export default async function LoginPage({
  searchParams,
}: {
  readonly searchParams: Promise<{ readonly redirect?: string | string[] }>;
}) {
  const { redirect: requested } = await searchParams;
  const target = safeRedirect(typeof requested === "string" ? requested : null);
  const mode = accessMode();

  if (mode === "vercel" || mode === "open") {
    redirect(target);
  }
  if (
    mode === "password" &&
    (await verifyAccessToken((await cookies()).get(ACCESS_COOKIE)?.value))
  ) {
    redirect(target);
  }

  return (
    <main
      className="bg-background text-foreground flex min-h-dvh items-center justify-center px-4"
      id="main"
    >
      <div className="flex w-full max-w-sm flex-col gap-6">
        <div className="flex flex-col items-center gap-3 text-center">
          <LMark label="" size={56} />
          <h1 className="text-2xl font-medium tracking-tight">
            Sign In to Lopsi Bot
          </h1>
          <p className="text-muted-foreground text-sm">
            {mode === "password"
              ? "Enter the access password to reach the crew."
              : "This crew isn't accepting visitors yet."}
          </p>
        </div>
        {mode === "password" ? (
          <PasswordForm redirectTo={target} />
        ) : (
          <SetupNotice mode={mode} />
        )}
      </div>
    </main>
  );
}
