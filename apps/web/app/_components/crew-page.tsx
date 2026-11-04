import { notFound, redirect } from "next/navigation";
import { configuredConnectors } from "@/lib/connectors";
import { CREW } from "@/lib/crew.generated";
import { currentAccount } from "@/lib/current-account";
import { configChangesUnavailable } from "@/lib/github";
import { CrewApp } from "./crew-app";
import { SignInWithVercel } from "./sign-in-with-vercel";

/**
 * Every crew page: checks access on the server, then renders the dashboard with
 * the selected crew member and chat, if any.
 */
export async function CrewPage({
  memberId,
  path,
  sessionId,
}: {
  readonly memberId?: string;
  /** This page's path, so starter-mode sign-in can return to it. */
  readonly path: string;
  readonly sessionId?: string;
}) {
  if (
    memberId !== undefined &&
    !CREW.some((member) => member.id === memberId)
  ) {
    notFound();
  }

  const account = await currentAccount();
  if (account === "sign-in-with-vercel") {
    return <SignInWithVercel />;
  }
  if (account === "login") {
    redirect(`/login?redirect=${encodeURIComponent(path)}`);
  }
  // Names only: connector UIDs stay on the server.
  const connectors = configuredConnectors().map(({ id, name }) => ({
    id,
    name,
  }));
  // Configuration by pull request; local development edits files directly.
  const reason = configChangesUnavailable();
  const changes =
    account.kind === "open"
      ? undefined
      : {
          available: reason === undefined,
          ...(reason === undefined ? {} : { reason }),
        };
  return (
    <CrewApp
      account={account}
      changes={changes}
      connectors={connectors}
      memberId={memberId}
      sessionId={sessionId}
    />
  );
}
