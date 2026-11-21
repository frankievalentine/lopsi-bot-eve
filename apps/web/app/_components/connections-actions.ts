"use server";

import {
  getTokenResponse,
  NoValidTokenError,
  revokeToken,
  UserAuthorizationRequiredError,
} from "@vercel/connect";
import {
  connectors as attachedConnectors,
  grantSubject,
} from "@/lib/connectors";
import { grantHolder } from "@/lib/grant-holder";

/** Whether the signed-in person has connected their account to one service. */
export interface ConnectionStatus {
  readonly id: string;
  /** `unknown` when Vercel Connect couldn't be asked. */
  readonly state: "connected" | "not-connected" | "unknown";
}

/** The signed-in person's status for every configured connector. */
export async function connectionStatuses(): Promise<
  readonly ConnectionStatus[]
> {
  const holder = await grantHolder();
  const connectors = (await attachedConnectors()).filter(
    (connector) => connector.perPerson
  );
  if (holder === undefined) {
    return connectors.map(({ id }) => ({ id, state: "unknown" }));
  }
  const subject = grantSubject(holder);
  return await Promise.all(
    connectors.map(async ({ id }): Promise<ConnectionStatus> => {
      try {
        // A token proves the grant; it never leaves the server.
        await getTokenResponse(id, { subject }, { forceRefresh: true });
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
  const connector = (await attachedConnectors()).find(
    ({ id, perPerson }) => perPerson && id === connectorId
  );
  if (holder === undefined || connector === undefined) {
    throw new Error("Nothing to disconnect.");
  }
  await revokeToken(connector.id, { subject: grantSubject(holder) });
}
