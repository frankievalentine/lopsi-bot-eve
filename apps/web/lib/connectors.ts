/**
 * The services the crew can use: every Vercel Connect connector attached to
 * this project, whatever the service. People create and attach them in the
 * Vercel dashboard (Settings → Integrations links there); nothing here names a
 * service.
 *
 * A deployment's own OIDC token can't list connectors, only fetch one it
 * already knows, so listing needs `VERCEL_TOKEN`, a Vercel access token on the
 * team. It's read on the server only: neither the model nor the sandbox sees
 * it. Without it the crew has no connectors and Settings says why.
 *
 * @packageDocumentation
 */

import type { ConnectionToolAnnotations } from "eve/tools/approval";
import { deploymentTarget, VercelApiError, vercelApi } from "./vercel-project";

/** How long a listing is reused, so a connector attached in Vercel shows up within this. */
const LISTING_MS = 30_000;

/** A Vercel Connect connector attached to this project. */
export interface Connector {
  /** The service's icon, as a data URI. */
  readonly icon?: string;
  /** Vercel Connect's id for it (`scl_…`). */
  readonly id: string;
  /**
   * `mcp`: an MCP server, whose tools the crew gets. `api`: a credential for
   * the service's HTTP API, which the crew calls through `call_service`.
   */
  readonly kind: "api" | "mcp";
  /** The connection name, from the connector's name: `my-linear`, so its tools are `my-linear__<tool>`. */
  readonly name: string;
  /** Each person signs in with their own account; otherwise the crew uses the connector's own credential. */
  readonly perPerson: boolean;
  /** The service it reaches (`linear`), and its display name (`Linear`). */
  readonly service: string;
  readonly serviceName: string;
  /** What Vercel shows for it. */
  readonly title: string;
  /** The service can send it events (Slack and Telegram messages), forwarded to the paths here. */
  readonly triggers?: { readonly paths: readonly string[] };
  /** Vercel Connect's readable id (`linear/my-linear`). */
  readonly uid: string;
  /** The MCP server, for `mcp`. */
  readonly url?: string;
}

/**
 * Why there's no list of connectors. `expired`: Vercel didn't accept the token
 * (401). `no-access`: the token can't see this team's connectors (403 or 404),
 * typically because it's scoped to one project instead of the team.
 * `refused`: anything else.
 */
export type ConnectorsUnavailable =
  | "expired"
  | "no-access"
  | "no-project"
  | "no-token"
  | "refused";

/** Why a failed listing failed, from the status Vercel answered. */
export function unavailableReason(error: unknown): ConnectorsUnavailable {
  if (!(error instanceof VercelApiError)) {
    return "refused";
  }
  if (error.status === 401) {
    return "expired";
  }
  return error.status === 403 || error.status === 404 ? "no-access" : "refused";
}

export type ConnectorListing =
  | { readonly connectors: readonly Connector[]; readonly ok: true }
  | { readonly ok: false; readonly reason: ConnectorsUnavailable };

export interface Attachment {
  readonly connectorId: string;
  readonly enabledEnvironments?: readonly string[];
}

/** What Vercel Connect returns for one connector; only the parts used here. */
export interface ConnectorRecord {
  readonly connectionMethod?: string;
  readonly createdAt?: number;
  readonly data?: { readonly serverUrl?: unknown };
  readonly displayName?: string;
  readonly id: string;
  readonly name: string;
  readonly service: string;
  readonly serviceIcon?: string;
  readonly serviceName?: string;
  readonly supportedSubjectTypes?: readonly string[];
  readonly supportsTriggers?: boolean;
  readonly triggerDestinations?: readonly TriggerDestination[];
  readonly uid: string;
}

interface TriggerDestination {
  readonly branch?: string;
  readonly customEnvironmentId?: string;
  readonly path?: string;
  readonly projectId: string;
}

const NOT_NAME = /[^a-z0-9]+/gu;
const EDGE_DASHES = /^-+|-+$/gu;
const STARTS_WITH_LETTER = /^[a-z]/u;
/** crew.json's limit on a connector name (apps/web/lib/crew-core.mjs). */
const NAME_LENGTH = 31;

/** A connection name from a connector's name: lowercase letters, digits and dashes, starting with a letter. */
function nameOf(record: ConnectorRecord): string {
  const slug = (record.name || record.service)
    .toLowerCase()
    .replace(NOT_NAME, "-")
    .replace(EDGE_DASHES, "");
  const named = STARTS_WITH_LETTER.test(slug) ? slug : `c-${slug}`;
  return named.slice(0, NAME_LENGTH).replace(EDGE_DASHES, "");
}

/** The connectors for these records, oldest first, each with its own name. */
export function toConnectors(
  records: readonly ConnectorRecord[],
  projectId: string
): readonly Connector[] {
  const taken = new Set<string>();
  return [...records]
    .sort((a, b) => (a.createdAt ?? 0) - (b.createdAt ?? 0))
    .map((record) => {
      const base = nameOf(record);
      let name = base;
      for (let n = 2; taken.has(name); n += 1) {
        name = `${base.slice(0, NAME_LENGTH - String(n).length - 1)}-${n}`;
      }
      taken.add(name);
      const url =
        typeof record.data?.serverUrl === "string"
          ? record.data.serverUrl
          : undefined;
      const paths = (record.triggerDestinations ?? [])
        .filter((destination) => destination.projectId === projectId)
        .map((destination) => destination.path ?? `/${record.service}`);
      return {
        id: record.id,
        kind: record.connectionMethod === "mcp" && url ? "mcp" : "api",
        name,
        perPerson: (record.supportedSubjectTypes ?? ["user"]).includes("user"),
        service: record.service,
        serviceName: record.serviceName ?? record.service,
        title: record.displayName || record.name,
        uid: record.uid,
        ...(record.serviceIcon ? { icon: record.serviceIcon } : {}),
        ...(record.supportsTriggers ? { triggers: { paths } } : {}),
        ...(url && record.connectionMethod === "mcp" ? { url } : {}),
      } satisfies Connector;
    });
}

/** The environment this deployment serves, as Vercel Connect names it. */
function environment(): string {
  return (
    process.env.VERCEL_TARGET_ENV ?? process.env.VERCEL_ENV ?? "development"
  );
}

/** One page of a project's attached connectors. */
export interface AttachmentPage {
  readonly connectors?: readonly Attachment[];
  readonly pagination?: { readonly next?: string | null };
}

/** The most a page holds; Vercel refuses a larger `limit`. */
const PAGE_SIZE = 100;

/**
 * Every connector attached to the project, reading page after page: each
 * page's `pagination.next` is the `cursor` for the one after it. A cursor
 * that comes back twice throws rather than loop.
 */
export async function allAttachments(
  fetchPage: (query: string) => Promise<AttachmentPage>
): Promise<readonly Attachment[]> {
  const attached: Attachment[] = [];
  const seen = new Set<string>();
  let cursor: string | undefined;
  do {
    const query = new URLSearchParams({ limit: String(PAGE_SIZE) });
    if (cursor !== undefined) {
      query.set("cursor", cursor);
    }
    // biome-ignore lint/performance/noAwaitInLoops: each page's cursor comes from the page before it.
    const page = await fetchPage(query.toString());
    attached.push(...(page.connectors ?? []));
    cursor = page.pagination?.next || undefined;
    if (cursor !== undefined) {
      if (seen.has(cursor)) {
        throw new Error(`Vercel Connect returned the cursor ${cursor} twice.`);
      }
      seen.add(cursor);
    }
  } while (cursor !== undefined);
  return attached;
}

async function listConnectors(): Promise<ConnectorListing> {
  if (!process.env.VERCEL_TOKEN?.trim()) {
    return { ok: false, reason: "no-token" };
  }
  const target = await deploymentTarget();
  if (target === undefined) {
    return { ok: false, reason: "no-project" };
  }
  try {
    const attached = await allAttachments(
      (query) =>
        vercelApi(
          target,
          `/v2/connect/projects/${encodeURIComponent(target.projectId)}/connectors?${query}`
        ) as Promise<AttachmentPage>
    );
    const here = environment();
    const records = await Promise.all(
      attached
        .filter(
          (attachment) => attachment.enabledEnvironments?.includes(here) ?? true
        )
        .map(
          (attachment) =>
            vercelApi(
              target,
              `/v1/connect/connectors/${encodeURIComponent(attachment.connectorId)}`
            ) as Promise<ConnectorRecord>
        )
    );
    return { connectors: toConnectors(records, target.projectId), ok: true };
  } catch (error) {
    console.error("[lopsi] couldn't list Vercel Connect connectors:", error);
    return { ok: false, reason: unavailableReason(error) };
  }
}

let listing: { at: number; result: Promise<ConnectorListing> } | undefined;

/** The connectors attached to this project, listed at most every 30 seconds. */
export function connectorListing(): Promise<ConnectorListing> {
  if (listing === undefined || Date.now() - listing.at > LISTING_MS) {
    listing = { at: Date.now(), result: listConnectors() };
  }
  return listing.result;
}

/** Lists again on the next call, after something here changed a connector. */
function forgetConnectorListing(): void {
  listing = undefined;
}

/** The connectors attached to this project; none when they can't be listed. */
export async function connectors(): Promise<readonly Connector[]> {
  const result = await connectorListing();
  return result.ok ? result.connectors : [];
}

/** The services people can chat with a crew member in, through their connector's events. */
export const CHAT_SERVICES = ["slack", "telegram"] as const;
export type ChatService = (typeof CHAT_SERVICES)[number];

/** Where a crew member's channel for a service takes events (agents/<member>/agent/channels/<service>.ts). */
export function chatPath(memberId: string, service: ChatService): string {
  return `/eve/${memberId}/v1/${service}`;
}

/**
 * The connector a crew member's chat channel answers through: the one of that
 * service sending events to the member's path, else the first of that service.
 */
export async function chatConnector(
  memberId: string,
  service: ChatService
): Promise<Connector> {
  const candidates = (await connectors()).filter(
    (entry) => entry.service === service
  );
  const path = chatPath(memberId, service);
  const connector =
    candidates.find((entry) => entry.triggers?.paths.includes(path)) ??
    candidates[0];
  if (connector === undefined) {
    throw new Error(`No ${service} connector is attached to this project.`);
  }
  return connector;
}

/** Where a Resend connector sends received email: the dashboard hands each one to the member it's addressed to (app/api/email). */
export const EMAIL_PATH = "/api/email";

/** The Resend connector that receives the crew's email, once Settings has turned it on. */
export async function emailConnector(): Promise<Connector | undefined> {
  return (await connectors()).find(
    (connector) =>
      connector.service === "resend" &&
      connector.triggers?.paths.includes(EMAIL_PATH)
  );
}

/**
 * Has a connector send its events to this deployment: a Slack or Telegram
 * connector to a crew member's chat channel, a Resend connector to the email
 * route. Where it sends them for other projects is kept; this project's
 * earlier path is replaced.
 */
export async function sendEventsTo(
  connectorId: string,
  to: { readonly memberId: string } | "email"
): Promise<void> {
  const target = await deploymentTarget();
  if (target === undefined) {
    throw new Error("This deployment's project isn't known.");
  }
  const record = (await vercelApi(
    target,
    `/v1/connect/connectors/${encodeURIComponent(connectorId)}`
  )) as ConnectorRecord;
  const service = record.serviceName ?? record.service;
  let path: string;
  if (to === "email") {
    if (record.service !== "resend") {
      throw new Error(`${service} doesn't receive email.`);
    }
    path = EMAIL_PATH;
  } else {
    if (!(CHAT_SERVICES as readonly string[]).includes(record.service)) {
      throw new Error(`${service} has no chat channel.`);
    }
    path = chatPath(to.memberId, record.service as ChatService);
  }
  const destinations = [
    ...(record.triggerDestinations ?? []).filter(
      (destination) => destination.projectId !== target.projectId
    ),
    { path, projectId: target.projectId },
  ];
  await vercelApi(
    target,
    `/v1/connect/connectors/${encodeURIComponent(connectorId)}/trigger-destinations`,
    { body: { destinations }, method: "PATCH" }
  );
  forgetConnectorListing();
}

/** The connectors one crew member may use: crew.json `connectors`, by name; absent is all of them. */
export function allowedFor(
  list: readonly Connector[],
  allowed: readonly string[] | undefined
): readonly Connector[] {
  return allowed === undefined
    ? list
    : list.filter((connector) => allowed.includes(connector.name));
}

/**
 * An MCP connector's approval policy (agents/<name>/agent/connections/services.ts):
 * read-only tools run; everything else waits for a person, including tools the
 * server says nothing about and ones it calls both read-only and destructive.
 * Annotations are the server's own hints.
 */
export function connectorApproval({
  toolAnnotations,
}: {
  readonly toolAnnotations?: ConnectionToolAnnotations;
}): "user-approval" | "not-applicable" {
  // A tool that also claims to be destructive contradicts itself; ask. MCP
  // defaults destructiveHint to true, so only an explicit true counts.
  const readOnly =
    toolAnnotations?.readOnlyHint === true &&
    toolAnnotations.destructiveHint !== true;
  return readOnly ? "not-applicable" : "user-approval";
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
