"use server";

import {
  getTokenResponse,
  NoValidTokenError,
  revokeToken,
  UserAuthorizationRequiredError,
} from "@vercel/connect";
import { OPERATOR } from "@/lib/access";
import { configuredConnectors, grantSubject } from "@/lib/connectors";
import { currentAccount } from "@/lib/current-account";

/** Whether the signed-in person has connected their account to one service. */
export interface ConnectionStatus {
  readonly id: string;
  /** `unknown` when Vercel Connect couldn't be asked. */
  readonly state: "connected" | "not-connected" | "unknown";
}

/**
 * Whose grants this request may see and revoke: the signed-in person's own,
 * resolved on the server. Local development has no person to hold a grant.
 */
async function grantHolder() {
  const account = await currentAccount();
  if (typeof account === "string" || account.kind === "open") {
    return;
  }
  return account.kind === "vercel" ? { principalId: account.id } : OPERATOR;
}

/** The signed-in person's status for every configured connector. */
export async function connectionStatuses(): Promise<
  readonly ConnectionStatus[]
> {
  const holder = await grantHolder();
  const connectors = configuredConnectors();
  if (holder === undefined) {
    return connectors.map(({ id }) => ({ id, state: "unknown" }));
  }
  const subject = grantSubject(holder);
  return await Promise.all(
    connectors.map(async ({ id, uid }): Promise<ConnectionStatus> => {
      try {
        // A token proves the grant; it never leaves the server.
        await getTokenResponse(uid, { subject }, { forceRefresh: true });
        return { id, state: "connected" };
      } catch (error) {
        if (
          error instanceof UserAuthorizationRequiredError ||
          error instanceof NoValidTokenError
        ) {
          return { id, state: "not-connected" };
        }
        return { id, state: "unknown" };
      }
    })
  );
}

/** Revokes the signed-in person's grant for one connector at Vercel Connect. */
export async function disconnect(connectorId: string): Promise<void> {
  const holder = await grantHolder();
  const connector = configuredConnectors().find(({ id }) => id === connectorId);
  if (holder === undefined || connector === undefined) {
    throw new Error("Nothing to disconnect.");
  }
  await revokeToken(connector.uid, { subject: grantSubject(holder) });
}
