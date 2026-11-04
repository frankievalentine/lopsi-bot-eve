import { currentAccount } from "./current-account";
import { isProductionMode } from "./production-mode";
import { type SessionOwner, SIGNED_IN_AUTHENTICATOR } from "./session-owners";

/**
 * The signed-in person, as the agent records chat owners, when production mode
 * keeps chat history on the server; `undefined` otherwise (starter mode, local
 * development), where the list stays in the browser.
 */
export async function currentChatOwner(): Promise<SessionOwner | undefined> {
  if (!isProductionMode()) {
    return;
  }
  const account = await currentAccount();
  if (typeof account === "string" || account.kind !== "vercel") {
    return;
  }
  return { authenticator: SIGNED_IN_AUTHENTICATOR, principalId: account.id };
}
