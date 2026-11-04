import { connect } from "@vercel/connect/eve";
import { defineDynamic, defineMcpClientConnection } from "eve/connections";
import type { ConnectionToolAnnotations } from "eve/tools/approval";
import {
  type ConfiguredConnector,
  configuredConnectors,
} from "../../../../apps/web/lib/connectors.js";
import crew from "../../crew.json" with { type: "json" };

/** The connectors this member may use (crew.json `connectors`); absent is all of them. */
const allowed: readonly string[] | undefined = (
  crew as { connectors?: string[] }
).connectors;

/**
 * Read-only tools run; everything else waits for a person, including tools the
 * server says nothing about. Annotations are the server's own hints; a tool on
 * the connector's `approve` list always asks, whatever its hints say.
 */
function approvalFor(connector: ConfiguredConnector) {
  const alwaysAsk = new Set(connector.approve ?? []);
  const prefix = `${connector.id}__`;
  return ({
    toolAnnotations,
    toolName,
  }: {
    readonly toolAnnotations?: ConnectionToolAnnotations;
    readonly toolName: string;
  }) => {
    const name = toolName.startsWith(prefix)
      ? toolName.slice(prefix.length)
      : toolName;
    return alwaysAsk.has(name) || toolAnnotations?.readOnlyHint !== true
      ? "user-approval"
      : "not-applicable";
  };
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
        approval: approvalFor(connector),
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
