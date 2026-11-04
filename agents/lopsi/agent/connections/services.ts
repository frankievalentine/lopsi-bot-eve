import { connect } from "@vercel/connect/eve";
import { defineDynamic, defineMcpClientConnection } from "eve/connections";
import type { ConnectionToolAnnotations } from "eve/tools/approval";
import { configuredConnectors } from "../../../../apps/web/lib/connectors.js";

/**
 * Read-only tools run; everything else waits for a person, including tools the
 * server says nothing about. Annotations are the server's own hints.
 */
function writesNeedApproval({
  toolAnnotations,
}: {
  readonly toolAnnotations?: ConnectionToolAnnotations;
}) {
  return toolAnnotations?.readOnlyHint === true
    ? "not-applicable"
    : "user-approval";
}

/**
 * The services set up with `pnpm setup:connector` (apps/web/lib/connectors.json),
 * one MCP connection each, named by its id (`linear__search_issues`). A
 * connector that isn't set up doesn't exist for the model, so a starter
 * deployment never reaches for a service it can't use.
 *
 * Each person authorizes their own account the first time the agent needs it
 * (a connect card in the chat). In starter mode everyone shares one identity,
 * and so one grant.
 */
export default defineDynamic(() => {
  const connectors = configuredConnectors();
  if (connectors.length === 0) {
    return null;
  }
  return Object.fromEntries(
    connectors.map((connector) => [
      connector.id,
      defineMcpClientConnection({
        approval: writesNeedApproval,
        auth: connect({
          connector: connector.uid,
          displayName: connector.name,
        }),
        description: connector.description,
        instanceKey: connector.uid,
        url: connector.url,
      }),
    ])
  );
});
