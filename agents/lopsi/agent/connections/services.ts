import { connect } from "@vercel/connect/eve";
import { defineDynamic, defineMcpClientConnection } from "eve/connections";
import {
  configuredConnectors,
  connectorApproval,
} from "../../../../apps/web/lib/connectors.js";
import crew from "../../crew.json" with { type: "json" };

/** The connectors this member may use (crew.json `connectors`); absent is all of them. */
const allowed: readonly string[] | undefined = (
  crew as { connectors?: string[] }
).connectors;

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
  const connectors = configuredConnectors().filter(
    (connector) => allowed === undefined || allowed.includes(connector.id)
  );
  if (connectors.length === 0) {
    return null;
  }
  return Object.fromEntries(
    connectors.map((connector) => [
      connector.id,
      defineMcpClientConnection({
        approval: connectorApproval(connector),
        auth: connect({
          connector: connector.uid,
          displayName: connector.name,
        }),
        description: connector.description,
        instanceKey: connector.uid,
        url: connector.url,
        ...(connector.tools ? { tools: connector.tools } : {}),
      }),
    ])
  );
});
