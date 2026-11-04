#!/usr/bin/env node
/**
 * Sets up one of the crew's services (apps/web/lib/connectors.json) with Vercel
 * Connect: creates a connector for its MCP server, attaches it to this project,
 * and stores its UID in the service's variable (LINEAR_CONNECTOR, …) for
 * production, preview and development. The agent picks the service up on the
 * next deploy; until then nothing changes.
 *
 * Safe to re-run: with the variable already set it only reports it, and a
 * connector of the same service already linked to the project (one added in the
 * Vercel dashboard, say) is reused instead of creating another. Creating a
 * connector may open a browser to authorize the service's app. People still
 * connect their own accounts in a chat, the first time the crew needs them.
 *
 * `github` is different: the dashboard uses it, not the agent, to open pull
 * requests for crew changes. It creates a GitHub App connector
 * (GITHUB_CONNECTOR); install the app on this repository afterwards.
 *
 * Usage: pnpm setup:connector <linear|notion|sentry|github>
 */

import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import {
  createApi,
  fail,
  hasEnv,
  projectEnvs,
  readLinkedProject,
} from "./vercel-api.mjs";

const TARGETS = ["production", "preview", "development"];
const NOT_NAME = /[^a-z0-9-]/gu;

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

const catalog = [
  ...JSON.parse(readFileSync("apps/web/lib/connectors.json", "utf8")),
  ...DASHBOARD_CONNECTORS,
];
const [, , id] = process.argv;
const connector = catalog.find((entry) => entry.id === id);
if (!connector) {
  fail(
    `Usage: pnpm setup:connector <${catalog.map((entry) => entry.id).join("|")}>`
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

/**
 * The connector for this service already linked to the project, if exactly one
 * is. Several are ambiguous, so the script stops and lists them.
 */
function linkedConnector() {
  const filter = connector.create
    ? ["--type", connector.create]
    : ["--service", new URL(connector.url).hostname];
  let linked;
  try {
    linked = JSON.parse(
      vercel(["connect", "list", "--json", ...filter], { capture: true })
    ).connectors;
  } catch {
    return;
  }
  if (!Array.isArray(linked) || linked.length === 0) {
    return;
  }
  if (linked.length > 1) {
    fail(
      `Several ${connector.name} connectors are linked to this project (${linked.map((entry) => entry.uid).join(", ")}). Set ${connector.variable} to the one to use.`
    );
  }
  return linked[0].uid;
}

try {
  const project = api(`/v9/projects/${encodeURIComponent(projectId)}`);
  const envs = projectEnvs(api, projectId);
  const missing = TARGETS.filter(
    (target) => !hasEnv(envs, connector.variable, target)
  );

  if (missing.length === 0) {
    console.log(
      `\n  ${connector.name} is already set up (${connector.variable}).\n`
    );
    process.exit(0);
  }

  const existing = envs.find(
    (env) => env.key === connector.variable && env.value
  )?.value;
  let uid = existing ?? linkedConnector();
  if (uid) {
    console.log(
      `  Reusing connector ${uid}${existing ? ` from ${connector.variable}` : ", already linked to this project"}`
    );
  } else {
    const name = `${project.name.slice(0, 40)}-${connector.id}`
      .toLowerCase()
      .replace(NOT_NAME, "-");
    const service = connector.create ?? connector.url;
    console.log(
      `  Creating a Vercel Connect connector for ${connector.name} (${service})`
    );
    uid = uidFrom(
      vercel(["connect", "create", service, "--name", name, "--json"], {
        capture: true,
      })
    );
    if (!uid) {
      fail(
        `Couldn't read the new connector's UID. Find it with \`vercel connect list\` and set ${connector.variable} to it.`
      );
    }
    console.log(`  Created connector ${uid}`);
  }

  vercel([
    "connect",
    "attach",
    uid,
    "--yes",
    ...TARGETS.flatMap((target) => ["--environment", target]),
  ]);

  const result = api(`/v10/projects/${encodeURIComponent(projectId)}/env`, {
    body: [
      { key: connector.variable, target: missing, type: "plain", value: uid },
    ],
    method: "POST",
  });
  if (result.failed?.length) {
    fail(
      `Couldn't save ${connector.variable}. Set it to ${uid} in the project's environment variables.`
    );
  }
  console.log(`  Set ${connector.variable} (${missing.join(", ")})`);
  console.log(
    `${connector.next ? `\n  Next: ${connector.next.replace("<uid>", uid)}\n` : ""}\n  ${connector.name} is set up. Run \`eve deploy\` to publish it, and \`vercel env pull .env.local\` to use it locally.\n`
  );
} catch (error) {
  fail(error.message);
}
