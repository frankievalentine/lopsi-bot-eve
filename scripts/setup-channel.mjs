#!/usr/bin/env node
/**
 * Sets up a messaging channel (apps/web/lib/channels.json: Sendblue, Kapso,
 * Dial, AgentPhone, Beeper, Lark, Liveblocks, Novu, Velt, Zernio) for one
 * crew member, through eve's Chat SDK channel and the provider's own adapter:
 *
 * - installs the adapter's package if it isn't yet;
 * - writes agents/<member>/agent/channels/<id>.ts (commit it);
 * - connects Upstash for Redis for thread state when the project has none;
 * - asks for the provider's variables (secrets aren't echoed, and are saved
 *   as sensitive) and who may write (LOPSI_<ID>_SENDERS);
 * - prints the webhook URL to give the provider.
 *
 * One crew member answers each channel. Safe to re-run: it keeps what's set.
 * Email has its own setup: `pnpm setup:email`.
 *
 * Usage: pnpm setup:channel <id>
 */

import { execFileSync } from "node:child_process";
import { existsSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { sendersVariable } from "../apps/web/lib/channel-core.mjs";
import { ask, askSecret, closePrompts } from "./prompt.mjs";
import { ensureRedis } from "./upstash.mjs";
import {
  createApi,
  fail,
  hasEnvEverywhere,
  projectEnvs,
  readLinkedProject,
  saveEnvs,
} from "./vercel-api.mjs";

const TARGETS = ["production", "preview"];
const catalog = JSON.parse(readFileSync("apps/web/lib/channels.json", "utf8"));
const [, , id] = process.argv;
const entry = catalog.find((candidate) => candidate.id === id);
if (!entry) {
  fail(
    `Usage: pnpm setup:channel <${catalog.map((candidate) => candidate.id).join("|")}>. For email, run pnpm setup:email.`
  );
}

const { projectId, team } = readLinkedProject();
const api = createApi(team);

const allowlist = sendersVariable(entry.id);

function members() {
  return readdirSync("agents", { withFileTypes: true })
    .filter(
      (dir) => dir.isDirectory() && existsSync(`agents/${dir.name}/agent`)
    )
    .map((dir) => dir.name)
    .sort();
}

const channelPath = (member) =>
  `agents/${member}/agent/channels/${entry.id}.ts`;

/** An adapter option's value in the channel's source. */
function optionSource(member, option) {
  if ("env" in option) {
    return `process.env.${option.env} ?? ""`;
  }
  return option.member === "id" ? JSON.stringify(member) : "crew.name";
}

/** The channel file: the provider's adapter behind the crew's sender gate. */
function channelSource(member) {
  // Sorted, as Biome wants object keys.
  const options = Object.entries(entry.options ?? {}).sort(([a], [b]) =>
    a < b ? -1 : 1
  );
  const adapter =
    options.length === 0
      ? `${entry.factory}()`
      : `${entry.factory}({\n${options.map(([field, option]) => `      ${field}: ${optionSource(member, option)},`).join("\n")}\n    })`;
  const streaming = entry.streaming
    ? ""
    : "  // A sent message can't be edited, so each reply posts once.\n  streaming: false,\n";
  return `import { ${entry.factory} } from "${entry.package}";
import { chatSdkChannel } from "eve/channels/chat-sdk";
import { isConfigured } from "../../../../apps/web/lib/channel-core.mjs";
import {
  buildAdapter,
  channelState,
  guardChannel,
} from "../../../../apps/web/lib/channel-guard.js";
import crew from "../../crew.json" with { type: "json" };

/**
 * ${entry.name} for this crew member, from \`pnpm setup:channel ${entry.id}\`. Its
 * webhook is /eve/${member}/v1/${entry.adapter}; only senders on ${allowlist}
 * reach the agent. Until its variables are set, it's off: its webhook fails the
 * provider's signature check and every message is dropped.
 */
const variables = ${JSON.stringify(entry.env.map((variable) => variable.name))};
const enabled = isConfigured(variables);

const { bot, channel, send } = chatSdkChannel({
  adapters: {
    ${entry.adapter}: buildAdapter(enabled, variables, () => ${adapter}),
  },
  // A message arriving mid-reply joins the running turn.
  concurrency: "concurrent",
  state: channelState("lopsi:${entry.id}", enabled),
${streaming}  userName: crew.name,
});

guardChannel({ bot, channel: "${entry.id}", enabled, send });

export default channel;
`;
}

function installed() {
  const pkg = JSON.parse(readFileSync("package.json", "utf8"));
  return entry.package in { ...pkg.dependencies, ...pkg.devDependencies };
}

async function chooseMember() {
  const all = members();
  const taken = all.filter((candidate) => existsSync(channelPath(candidate)));
  if (taken.length > 0) {
    console.log(`  ${entry.name} is answered by ${taken[0]}.`);
    return taken[0];
  }
  const member =
    all.length === 1
      ? all[0]
      : await ask(
          `Which crew member answers ${entry.name}? (${all.join(", ")})`,
          all.includes("lopsi") ? "lopsi" : all[0]
        );
  if (!all.includes(member)) {
    fail(`No crew member ${member}.`);
  }
  return member;
}

/** The provider's variables, asked for when unset (secrets without echo). */
/** Asks for one provider variable: a write to save, or nothing when it's set. */
async function askVariable(envs, variable) {
  if (hasEnvEverywhere(envs, variable.name, TARGETS)) {
    console.log(`  ${variable.name} is set`);
    return;
  }
  const value = variable.secret
    ? await askSecret(variable.name)
    : await ask(variable.name);
  if (!value) {
    fail(
      `${variable.name} is needed; find it in your ${entry.name} dashboard.`
    );
  }
  return {
    key: variable.name,
    target: TARGETS,
    type: variable.secret ? "sensitive" : "plain",
    value,
  };
}

/** Asks for each variable in turn, as a person answers prompts. */
async function askVariables(envs, variables) {
  const [first, ...rest] = variables;
  if (first === undefined) {
    return [];
  }
  const write = await askVariable(envs, first);
  return [...(write ? [write] : []), ...(await askVariables(envs, rest))];
}

async function ensureVariables(envs) {
  const writes = await askVariables(envs, entry.env);
  if (!hasEnvEverywhere(envs, allowlist, TARGETS)) {
    console.log(
      `\n  Only these senders reach the crew on ${entry.name}; others are dropped without a reply.`
    );
    const senders = await ask(
      `Allowed senders: ${entry.senders}, comma-separated`
    );
    if (!senders) {
      fail("Allow at least one sender.");
    }
    writes.push({
      key: allowlist,
      target: TARGETS,
      type: "plain",
      value: senders,
    });
  }
  saveEnvs(api, projectId, writes);
}

try {
  const project = api(`/v9/projects/${encodeURIComponent(projectId)}`);
  console.log(`\n  ${entry.name} for ${project.name}: ${entry.description}\n`);
  const member = await chooseMember();

  if (installed()) {
    console.log(`  ${entry.package} is installed`);
  } else {
    console.log(`  Installing ${entry.package}`);
    execFileSync("pnpm", ["add", entry.package, "--prefer-offline"], {
      stdio: "inherit",
    });
  }

  const path = channelPath(member);
  if (existsSync(path)) {
    console.log(`  ${path} exists; keeping it`);
  } else {
    writeFileSync(path, channelSource(member));
    execFileSync("pnpm", ["exec", "biome", "format", "--write", path], {
      stdio: "ignore",
    });
    console.log(`  Wrote ${path}`);
  }

  await ensureRedis({ api, project, projectId, targets: TARGETS });
  await ensureVariables(projectEnvs(api, projectId));

  const alias = project.targets?.production?.alias?.[0];
  const base = (
    await ask("Production URL", alias ? `https://${alias}` : undefined)
  ).replace(/\/+$/u, "");
  console.log(
    `\n  In ${entry.name}'s dashboard, point incoming messages at:\n    ${base}/eve/${member}/v1/${entry.adapter}\n\n  Commit ${path} (and package.json and pnpm-lock.yaml if they changed), then deploy.\n`
  );
} catch (error) {
  fail(error.message);
} finally {
  closePrompts();
}
