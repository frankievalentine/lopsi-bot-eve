/**
 * Whose Vercel Connect grants a request may see and revoke: the signed-in
 * person's own, resolved on the server.
 *
 * @packageDocumentation
 */

import { OPERATOR } from "./access";
import { currentAccount } from "./current-account";

/**
 * Whose grants this request may see and revoke: the signed-in person's own,
 * resolved on the server. Local development has no person to hold a grant.
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
  return account.kind === "vercel" ? { principalId: account.id } : OPERATOR;
}
