/**
 * The services the crew can use through Vercel Connect, from connectors.json,
 * which `pnpm setup:connector` reads too. A connector is active only once its
 * variable holds the connector UID that setup created; until then the agent
 * doesn't see it and the dashboard doesn't list it.
 *
 * @packageDocumentation
 */

import catalog from "./connectors.json";

interface Connector {
  /** Tools that always ask first, by their name on the server (`send-email`), whatever the server says about them. */
  readonly approve?: readonly string[];
  /** What the model reads to pick the connection. */
  readonly description: string;
  /** The eve connection name; its tools are `<id>__<tool>`. */
  readonly id: string;
  readonly name: string;
  /**
   * Which of the server's tools the crew sees: `allow` for an explicit list
   * (tools the server adds later stay hidden), or `block` to hide a few.
   */
  readonly tools?:
    | { readonly allow: readonly string[] }
    | { readonly block: readonly string[] };
  /** The service's MCP endpoint. */
  readonly url: string;
  /** The environment variable holding the Vercel Connect connector UID. */
  readonly variable: string;
}

const CONNECTORS: readonly Connector[] = catalog;

/** A connector whose Vercel Connect connector is set up, with its UID. */
export interface ConfiguredConnector extends Connector {
  readonly uid: string;
}

/** Every service in connectors.json, and whether this deployment has set it up. */
export function connectorCatalog(): readonly {
  readonly configured: boolean;
  readonly description: string;
  readonly id: string;
  readonly name: string;
  readonly variable: string;
}[] {
  return CONNECTORS.map(({ description, id, name, variable }) => ({
    configured: Boolean(process.env[variable]?.trim()),
    description,
    id,
    name,
    variable,
  }));
}

/** The connectors set up for this deployment. */
export function configuredConnectors(): readonly ConfiguredConnector[] {
  return CONNECTORS.flatMap((connector) => {
    const uid = process.env[connector.variable]?.trim();
    return uid ? [{ ...connector, uid }] : [];
  });
}

/** The parts of a caller Vercel Connect keys a person's grant by. */
interface GrantHolder {
  readonly issuer?: string;
  readonly principalId: string;
}

/**
 * The Vercel Connect subject for a person's grant. It must match what
 * `connect()` from `@vercel/connect/eve` derives from the turn's principal
 * (`{ type: "user", id, issuer }`), so the dashboard sees and revokes the same
 * grant the agent uses.
 */
export function grantSubject(holder: GrantHolder) {
  return {
    id: holder.principalId,
    type: "user" as const,
    ...(holder.issuer === undefined ? {} : { issuer: holder.issuer }),
  };
}
