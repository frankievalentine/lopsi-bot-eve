import { connect } from "@vercel/connect/eve";
import { defineDynamic, defineMcpClientConnection } from "eve/connections";
import {
  approvalModeOf,
  connectorApproval,
} from "../../../../apps/web/lib/approval-mode.js";
import { allowedFor, connectors } from "../../../../apps/web/lib/connectors.js";
import crew from "../../crew.json" with { type: "json" };

/** The connectors this member may use (crew.json `connectors`); absent is all of them. */
const allowed: readonly string[] | undefined = (
  crew as { connectors?: string[] }
).connectors;

/** Read-only tools run; the rest follow this member's mode (crew.json `approvals`). */
const approval = connectorApproval(approvalModeOf(crew));

/**
 * One MCP connection for each MCP connector attached to this project in Vercel
 * Connect (apps/web/lib/connectors.ts), named after it (`my-linear__search_issues`).
 * Other connectors are API credentials, for tools/call_service.ts. A connector
 * attached in Vercel is here within 30 seconds, without a redeploy.
 *
 * Each person authorizes their own account the first time the agent needs it
 * (a connect card in the chat). In starter mode everyone shares one identity,
 * and so one grant.
 */
export default defineDynamic(async () => {
  const servers = allowedFor(await connectors(), allowed).filter(
    (connector) => connector.kind === "mcp" && connector.url
  );
  if (servers.length === 0) {
    return null;
  }
  return Object.fromEntries(
    servers.map((connector) => [
      connector.name,
      defineMcpClientConnection({
        approval,
        auth: connect({
          connector: connector.id,
          displayName: connector.serviceName,
          ...(connector.perPerson ? {} : { principalType: "app" as const }),
        }),
        description: `${connector.serviceName} (${connector.title}), through its MCP server.`,
        instanceKey: connector.id,
        url: connector.url ?? "",
      }),
    ])
  );
});
