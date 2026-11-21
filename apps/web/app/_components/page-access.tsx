import { redirect } from "next/navigation";
import type { ReactElement } from "react";
import { connectors as attachedConnectors } from "@/lib/connectors";
import { currentAccount } from "@/lib/current-account";
import { configChangesUnavailable } from "@/lib/github";
import type { Account } from "./account";
import type { ConnectorSummary } from "./connections-dialog";
import { SignInWithVercel } from "./sign-in-with-vercel";
import { UnknownAddress } from "./unknown-address";

/**
 * Who may see a dashboard page, checked on the server: their account, or the
 * page to show instead (Sign in with Vercel). Starter mode redirects to the
 * password page and returns here.
 */
export async function pageAccess(
  path: string
): Promise<{ account: Account } | { page: ReactElement }> {
  const account = await currentAccount();
  if (account === "sign-in-with-vercel") {
    return { page: <SignInWithVercel /> };
  }
  if (account === "unknown-address") {
    return { page: <UnknownAddress /> };
  }
  if (account === "login") {
    redirect(`/login?redirect=${encodeURIComponent(path)}`);
  }
  return { account };
}

/** What every dashboard page offers besides chats: connectors and changes by pull request. */
export async function dashboardFeatures(account: Account): Promise<{
  changes?: { readonly available: boolean; readonly reason?: string };
  connectors: readonly ConnectorSummary[];
}> {
  if (account.kind === "demo") {
    return { connectors: [] };
  }
  // The ones each person signs in to, by name; nothing else about them leaves the server.
  const connectors = (await attachedConnectors())
    .filter((connector) => connector.perPerson)
    .map(({ id, serviceName, title }) => ({
      id,
      name: title === serviceName ? title : `${serviceName} (${title})`,
    }));
  // Configuration by pull request; local development edits files directly.
  if (account.kind === "open") {
    return { connectors };
  }
  const reason = await configChangesUnavailable();
  return {
    changes: {
      available: reason === undefined,
      ...(reason === undefined ? {} : { reason }),
    },
    connectors,
  };
}
