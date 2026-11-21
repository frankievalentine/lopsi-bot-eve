/**
 * The hosts each API connector's credential may be sent to. Vercel Connect
 * doesn't say where a service's API lives, so the first call to a new host
 * asks a person (agents/<name>/agent/tools/call_service.ts), and the answer is
 * kept here for every later call, by anyone. Settings lists them and can take
 * one back.
 *
 * They live in the private Blob store (`BLOB_STORE_ID`, reached with the
 * project's OIDC token), one small JSON document per connector. Without the
 * store nothing is kept, so every call to a host asks.
 *
 * @packageDocumentation
 */

import { BlobNotFoundError, get, put } from "@vercel/blob";

const PREFIX = "lopsi/connector-domains";
const CONNECTOR_ID = /^[A-Za-z0-9_-]{1,64}$/u;
const HOST = /^[a-z0-9.-]{1,253}$/u;

function storeConfigured(): boolean {
  return Boolean(
    process.env.BLOB_STORE_ID || process.env.BLOB_READ_WRITE_TOKEN
  );
}

function pathnameOf(connectorId: string): string {
  if (!CONNECTOR_ID.test(connectorId)) {
    throw new Error(`Not a connector id: ${connectorId}`);
  }
  return `${PREFIX}/${connectorId}.json`;
}

/** The hosts a connector's credential has been approved for. */
export async function approvedDomains(
  connectorId: string
): Promise<readonly string[]> {
  if (!storeConfigured()) {
    return [];
  }
  try {
    const result = await get(pathnameOf(connectorId), {
      access: "private",
      useCache: false,
    });
    if (result === null) {
      return [];
    }
    const hosts: unknown = JSON.parse(await new Response(result.stream).text());
    return Array.isArray(hosts)
      ? hosts.filter(
          (host): host is string => typeof host === "string" && HOST.test(host)
        )
      : [];
  } catch (error) {
    if (error instanceof BlobNotFoundError) {
      return [];
    }
    throw error;
  }
}

async function save(connectorId: string, hosts: readonly string[]) {
  await put(pathnameOf(connectorId), JSON.stringify([...hosts].sort()), {
    access: "private",
    addRandomSuffix: false,
    allowOverwrite: true,
    contentType: "application/json",
  });
}

/** Keeps a host a person approved for a connector; nothing without the store. */
export async function approveDomain(
  connectorId: string,
  host: string
): Promise<void> {
  if (!(storeConfigured() && HOST.test(host))) {
    return;
  }
  const hosts = await approvedDomains(connectorId);
  if (!hosts.includes(host)) {
    await save(connectorId, [...hosts, host]);
  }
}

/** Takes back a host, so the next call to it asks again. */
export async function revokeDomain(
  connectorId: string,
  host: string
): Promise<void> {
  const hosts = await approvedDomains(connectorId);
  if (hosts.includes(host)) {
    await save(
      connectorId,
      hosts.filter((entry) => entry !== host)
    );
  }
}
