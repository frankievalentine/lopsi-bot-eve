/**
 * Whose Vercel Connect grants a request may see and revoke: the signed-in
 * person's own, resolved on the server.
 *
 * @packageDocumentation
 */

import { OPERATOR } from "./access";
import { currentAccount } from "./current-account";
import { SIGNED_IN_AUTHENTICATOR } from "./session-owners";

/**
 * Whose grants this request may see and revoke: the signed-in person's own,
 * resolved on the server. Local development has no person to hold a grant.
 *
 * It must name the same Vercel Connect subject the agent's connections use.
 * eve gives a caller without an issuer its authenticator as the issuer, so a
 * Sign in with Vercel caller (channels/eve.ts) holds its grants under
 * `better-auth:vercel`; without it here, Settings and Connections would ask
 * about, and revoke, grants nobody holds.
 */
export async function grantHolder() {
  const account = await currentAccount();
  if (
    typeof account === "string" ||
    account.kind === "open" ||
    account.kind === "demo"
  ) {
    return;
  }
  return account.kind === "vercel"
    ? { issuer: SIGNED_IN_AUTHENTICATOR, principalId: account.id }
    : OPERATOR;
}
