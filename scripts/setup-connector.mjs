#!/usr/bin/env node
/**
 * Sets up a service for the crew with Vercel Connect: creates (or reuses) a
 * connector for its MCP server, attaches it to this project, and stores its UID
 * in the service's variable (LINEAR_CONNECTOR, …) for production, preview and
 * development. The agent picks the service up on the next deploy.
 *
 * The service can be:
 * - an entry in apps/web/lib/connectors.json (`linear`, `notion`, `sentry`);
 * - any Vercel Connect service that offers MCP (`vercel connect discover`);
 * - any MCP server, by URL.
 * A service that isn't in connectors.json yet is added to it; commit that file
 * so the deployment knows its MCP URL. Services with only an API (no MCP
 * server) can't become crew tools this way: they need a tool written for them.
 *
 * Safe to re-run: with the variable already set it only reports it, and a
 * connector for the same MCP server already linked to the project (one added in
 * the Vercel dashboard, say) is reused instead of creating another. Some
 * services need your own OAuth client: pass it with `--data <file>`. People
 * still connect their own accounts in a chat, the first time the crew needs them.
 *
 * `github` is different: the dashboard uses it, not the agent, to open pull
 * requests for crew changes. It creates a GitHub App connector
 * (GITHUB_CONNECTOR); install the app on this repository afterwards.
 *
 * Usage: pnpm setup:connector <entry | service | MCP URL> [--id <id>]
 *          [--name <name>] [--description <text>] [--data <credentials file>]
 */

import { execFileSync } from "node:child_process";
import { readFileSync, writeFileSync } from "node:fs";
import { parseArgs } from "node:util";
import {
  createApi,
  fail,
  hasEnv,
  projectEnvs,
  readLinkedProject,
  saveEnvs,
} from "./vercel-api.mjs";

const CATALOG_PATH = "apps/web/lib/connectors.json";
const TARGETS = ["production", "preview", "development"];
const NOT_NAME = /[^a-z0-9-]/gu;
const ID_SHAPE = /^[a-z][a-z0-9-]{0,30}$/u;
const MCP_HOST_PREFIX = /^(?:mcp|api|www)\./u;

/** Connectors the dashboard uses itself, not the agent: they aren't MCP connections. */
const DASHBOARD_CONNECTORS = [
  {
    create: "github",
    id: "github",
    name: "GitHub",
    next: "Install its GitHub App on this repository with read and write access to contents and pull requests (`vercel connect open <uid>`).",
    variable: "GITHUB_CONNECTOR",
  },
];

const { positionals, values: options } = parseArgs({
  allowPositionals: true,
  options: {
    data: { type: "string" },
    description: { type: "string" },
    id: { type: "string" },
    name: { type: "string" },
  },
});
const [target] = positionals;
const catalog = JSON.parse(readFileSync(CATALOG_PATH, "utf8"));
if (!target) {
  fail(
    `Usage: pnpm setup:connector <${[...catalog, ...DASHBOARD_CONNECTORS].map((entry) => entry.id).join("|")} | service | MCP URL>`
  );
}

const { projectId, team } = readLinkedProject();
const api = createApi(team);

function vercel(args, { capture = false } = {}) {
  return execFileSync("vercel", args, {
    encoding: "utf8",
    // Interactive steps (a browser authorization) need the terminal; JSON output is captured.
    stdio: ["inherit", capture ? "pipe" : "inherit", "inherit"],
  });
}

function vercelJson(args) {
  return JSON.parse(vercel([...args, "--json"], { capture: true }));
}

function isUrl(value) {
  return value.startsWith("https://") || value.startsWith("http://");
}

/** An id for a new entry: the service, or the MCP host without `mcp.` and its TLD. */
function newId(service, url) {
  const id =
    options.id ??
    service ??
    new URL(url).hostname.replace(MCP_HOST_PREFIX, "").split(".")[0];
  if (!ID_SHAPE.test(id)) {
    fail(
      `"${id}" can't be a connector id (lowercase letters, digits and hyphens). Pass --id <id>.`
    );
  }
  if ([...catalog, ...DASHBOARD_CONNECTORS].some((entry) => entry.id === id)) {
    fail(`connectors.json already has "${id}". Pass --id <id> to add another.`);
  }
  return id;
}

/** A Vercel Connect service that offers MCP, or why it can't be a crew tool. */
function mcpService(service) {
  const found = vercelJson(["connect", "discover", service]).services?.find(
    (entry) => entry.service === service
  );
  if (!found) {
    fail(
      `Vercel Connect has no service named "${service}". Find one with \`vercel connect discover <query>\`, or pass the MCP server's URL.`
    );
  }
  if (!found.connectionMethods?.includes("mcp")) {
    fail(
      `${found.name} has no MCP server in Vercel Connect (${found.connectionMethods?.join(", ") || "no methods"}), so the crew can't use it as tools this way. It needs a tool written for its API (see eve's tools docs).`
    );
  }
  return found;
}

/**
 * What to set up: an existing entry (connectors.json or the dashboard's), or a
 * new one from a Vercel Connect service or an MCP URL.
 */
function resolveTarget() {
  const known = [...catalog, ...DASHBOARD_CONNECTORS].find(
    (entry) => entry.id === target || (isUrl(target) && entry.url === target)
  );
  if (known) {
    return { connector: known, isNew: false };
  }
  if (isUrl(target)) {
    const id = newId(undefined, target);
    return {
      connector: {
        description: options.description ?? `${options.name ?? id} tools.`,
        id,
        name: options.name ?? id,
        url: target,
        variable: `${id.toUpperCase().replaceAll("-", "_")}_CONNECTOR`,
      },
      create: [target],
      isNew: true,
    };
  }
  const service = mcpService(target);
  const id = newId(service.service, undefined);
  return {
    connector: {
      description: options.description ?? service.description,
      id,
      name: options.name ?? service.name,
      variable: `${id.toUpperCase().replaceAll("-", "_")}_CONNECTOR`,
    },
    create: [service.service, "--connection-method", "mcp"],
    isNew: true,
    service: service.service,
  };
}

/** The team's connectors with their full records (`data.serverUrl` for MCP ones). */
function teamConnectors() {
  return api("/v1/connect/connectors").clients ?? [];
}

/**
 * The connector for this service already linked to the project, if exactly one
 * is: the same MCP server URL, the same catalog service, or the GitHub type.
 * Several are ambiguous, so the script stops and lists them.
 */
function linkedConnector({ connector, service }) {
  let linkedUids;
  try {
    linkedUids = new Set(
      vercelJson(["connect", "list"]).connectors.map((entry) => entry.uid)
    );
  } catch {
    return;
  }
  const matches = teamConnectors().filter(
    (record) =>
      linkedUids.has(record.uid) &&
      (connector.create
        ? record.type === connector.create
        : (connector.url && record.data?.serverUrl === connector.url) ||
          (service &&
            record.service === service &&
            record.connectionMethod === "mcp"))
  );
  if (matches.length > 1) {
    fail(
      `Several ${connector.name} connectors are linked to this project (${matches.map((record) => record.uid).join(", ")}). Set ${connector.variable} to the one to use.`
    );
  }
  return matches[0]?.uid;
}

/** The connector UID from `vercel connect create --json`, whichever shape it prints. */
function uidFrom(output) {
  try {
    const parsed = JSON.parse(output);
    const created = parsed.connector ?? parsed;
    return created.uid ?? created.id;
  } catch {
    // Not JSON: the caller reports the missing UID.
  }
}

/** Adds a new entry to connectors.json, with the MCP URL its connector reports. */
function addToCatalog(connector, uid) {
  const url =
    connector.url ??
    teamConnectors().find((record) => record.uid === uid)?.data?.serverUrl;
  if (!url) {
    fail(
      `Couldn't read ${uid}'s MCP server URL. Run again with its URL: pnpm setup:connector <MCP URL> --id ${connector.id}`
    );
  }
  // Pairs, so the entry keeps the key order of the ones already in the file.
  const entry = Object.fromEntries([
    ["id", connector.id],
    ["name", connector.name],
    ["description", connector.description],
    ["url", url],
    ["variable", connector.variable],
  ]);
  writeFileSync(
    CATALOG_PATH,
    `${JSON.stringify([...catalog, entry], null, 2)}\n`
  );
  console.log(`  Added ${connector.id} (${url}) to ${CATALOG_PATH}`);
}

try {
  const resolved = resolveTarget();
  const { connector } = resolved;
  const project = api(`/v9/projects/${encodeURIComponent(projectId)}`);
  const envs = projectEnvs(api, projectId);
  const missing = TARGETS.filter(
    (environment) => !hasEnv(envs, connector.variable, environment)
  );

  if (missing.length === 0 && !resolved.isNew) {
    console.log(
      `\n  ${connector.name} is already set up (${connector.variable}).\n`
    );
    process.exit(0);
  }

  const existing = envs.find(
    (env) => env.key === connector.variable && env.value
  )?.value;
  let uid = existing ?? linkedConnector(resolved);
  if (uid) {
    console.log(
      `  Reusing connector ${uid}${existing ? ` from ${connector.variable}` : ", already linked to this project"}`
    );
  } else {
    const name = `${project.name.slice(0, 40)}-${connector.id}`
      .toLowerCase()
      .replace(NOT_NAME, "-");
    const create = resolved.create ?? [connector.create ?? connector.url];
    console.log(
      `  Creating a Vercel Connect connector for ${connector.name} (${create[0]})`
    );
    uid = uidFrom(
      vercel(
        [
          "connect",
          "create",
          ...create,
          "--name",
          name,
          "--json",
          ...(options.data ? ["--data", `@${options.data}`] : []),
        ],
        { capture: true }
      )
    );
    if (!uid) {
      fail(
        `Couldn't read the new connector's UID. Find it with \`vercel connect list\` and set ${connector.variable} to it.`
      );
    }
    console.log(`  Created connector ${uid}`);
  }

  if (resolved.isNew) {
    addToCatalog(connector, uid);
  }

  vercel([
    "connect",
    "attach",
    uid,
    "--yes",
    ...TARGETS.flatMap((environment) => ["--environment", environment]),
  ]);

  saveEnvs(
    api,
    projectId,
    missing.length > 0
      ? [
          {
            key: connector.variable,
            target: missing,
            type: "plain",
            value: uid,
          },
        ]
      : []
  );
  const commit = resolved.isNew
    ? `\n  Commit ${CATALOG_PATH} and push; the deployment picks ${connector.name} up from it.`
    : "";
  console.log(
    `${connector.next ? `\n  Next: ${connector.next.replace("<uid>", uid)}\n` : ""}\n  ${connector.name} is set up. Run \`eve deploy\` to publish it, and \`vercel env pull .env.local\` to use it locally.${commit}\n`
  );
} catch (error) {
  fail(error.message);
}
