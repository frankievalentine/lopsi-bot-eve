#!/usr/bin/env node
/**
 * Sets up email for the crew with Resend, asking before each part:
 *
 * - Sending: the Resend connector (scripts/setup-connector.mjs resend), so the
 *   crew can send email as the person asking, with approval for every send.
 * - Receiving: each crew member answers `<member>@<domain>`. This provisions
 *   Upstash Redis for thread state when the project has none, stores your
 *   Resend API key (asked without echo, saved as a sensitive variable),
 *   LOPSI_EMAIL_DOMAIN and LOPSI_EMAIL_SENDERS, and creates each member's
 *   Resend webhook (`/eve/<member>/v1/resend`), saving its signing secret.
 *
 * Safe to re-run: it skips what's set up and creates missing webhooks, for
 * example after you add a crew member. Values are saved for production and
 * preview. Deploy afterwards.
 *
 * Usage: pnpm setup:email
 */

import { execFileSync } from "node:child_process";
import { existsSync, readdirSync } from "node:fs";
import {
  memberAddress,
  webhookSecretVariable,
} from "../apps/web/lib/channel-core.mjs";
import { ask, askSecret, closePrompts, confirm } from "./prompt.mjs";
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
const RESEND = "https://api.resend.com";

const { projectId, team } = readLinkedProject();
const api = createApi(team);

/** A Resend API call with the key; failures stop setup with Resend's message. */
async function resend(apiKey, path, init = {}) {
  const response = await fetch(`${RESEND}${path}`, {
    ...init,
    headers: {
      authorization: `Bearer ${apiKey}`,
      "content-type": "application/json",
    },
  });
  const body = await response.json().catch(() => ({}));
  if (!response.ok) {
    fail(
      `Resend ${init.method ?? "GET"} ${path} failed (${response.status}): ${body.message ?? "no message"}.`
    );
  }
  return body;
}

/** Crew members whose agent has the Resend channel. */
function emailMembers() {
  return readdirSync("agents", { withFileTypes: true })
    .filter(
      (entry) =>
        entry.isDirectory() &&
        existsSync(`agents/${entry.name}/agent/channels/resend.ts`)
    )
    .map((entry) => entry.name)
    .sort();
}

/** A variable's value as set for production, if readable (sensitive ones aren't). */
function productionValue(envs, key) {
  return envs.find(
    (env) =>
      env.key === key && [env.target].flat().includes("production") && env.value
  )?.value;
}

const everywhere = (envs, key) => hasEnvEverywhere(envs, key, TARGETS);

/** The Resend API key: kept if set, otherwise asked for, checked and saved. */
async function ensureApiKey(envs) {
  if (everywhere(envs, "RESEND_API_KEY")) {
    console.log(
      "  RESEND_API_KEY is set. To create webhooks, enter it once more (it isn't saved again)."
    );
  } else {
    console.log(
      "\n  Create an API key with full access at https://resend.com/api-keys."
    );
  }
  const apiKey = await askSecret("Resend API key");
  if (!apiKey.startsWith("re_")) {
    fail("That doesn't look like a Resend API key (they start with re_).");
  }
  const domains = (await resend(apiKey, "/domains")).data ?? [];
  if (!everywhere(envs, "RESEND_API_KEY")) {
    saveEnvs(api, projectId, [
      {
        key: "RESEND_API_KEY",
        target: TARGETS,
        type: "sensitive",
        value: apiKey,
      },
    ]);
  }
  return { apiKey, domains };
}

/** The receiving domain and allowed senders. */
async function ensureAddresses(envs, domains) {
  const writes = [];
  let domain = productionValue(envs, "LOPSI_EMAIL_DOMAIN");
  if (domain === undefined) {
    const names = domains.map((entry) => entry.name).filter(Boolean);
    console.log(
      `\n  Your Resend domains: ${names.join(", ") || "none"}. Receiving needs the domain's MX record pointing at Resend (Resend → Domains → Receiving), or use your account's <id>.resend.app address.`
    );
    domain = (
      await ask("Domain the crew receives email at", names[0])
    ).toLowerCase();
    if (!domain.includes(".")) {
      fail("Enter a domain, such as mail.example.com.");
    }
    writes.push({
      key: "LOPSI_EMAIL_DOMAIN",
      target: TARGETS,
      type: "plain",
      value: domain,
    });
  }
  if (!everywhere(envs, "LOPSI_EMAIL_SENDERS")) {
    console.log(
      "\n  Only these senders reach the crew, and only when their domain vouches for the mail (DMARC). Others are dropped without a reply."
    );
    const senders = await ask(
      "Allowed senders, comma-separated (ana@example.com, @example.com)"
    );
    if (!senders) {
      fail("Allow at least one sender address or @domain.");
    }
    writes.push({
      key: "LOPSI_EMAIL_SENDERS",
      target: TARGETS,
      type: "plain",
      value: senders,
    });
  }
  saveEnvs(api, projectId, writes);
  return domain;
}

/**
 * One Resend webhook per member, for `email.received` at its route. Resend
 * shows a signing secret only when it creates a webhook, so one whose secret
 * isn't saved here is replaced.
 */
/** A member's webhook: kept when its secret is saved, otherwise created (replacing any). */
async function memberWebhook(apiKey, envs, baseUrl, existing, member) {
  const endpoint = `${baseUrl}/eve/${member}/v1/resend`;
  const variable = webhookSecretVariable(member);
  const current = existing.filter((hook) => hook.endpoint === endpoint);
  if (current.length > 0 && everywhere(envs, variable)) {
    console.log(`  ${member}: webhook already set up`);
    return;
  }
  await Promise.all(
    current.map((hook) =>
      resend(apiKey, `/webhooks/${hook.id}`, { method: "DELETE" })
    )
  );
  const created = await resend(apiKey, "/webhooks", {
    body: JSON.stringify({ endpoint, events: ["email.received"] }),
    method: "POST",
  });
  if (!created.signing_secret) {
    fail(`Resend didn't return a signing secret for ${endpoint}.`);
  }
  console.log(`  ${member}: created webhook ${endpoint}`);
  return {
    key: variable,
    target: TARGETS,
    type: "sensitive",
    value: created.signing_secret,
  };
}

/**
 * One Resend webhook per member, for `email.received` at its route. Resend
 * shows a signing secret only when it creates a webhook, so one whose secret
 * isn't saved here is replaced.
 */
async function ensureWebhooks(apiKey, envs, baseUrl, members) {
  const existing = (await resend(apiKey, "/webhooks")).data ?? [];
  const writes = await Promise.all(
    members.map((member) =>
      memberWebhook(apiKey, envs, baseUrl, existing, member)
    )
  );
  saveEnvs(
    api,
    projectId,
    writes.filter((write) => write !== undefined)
  );
}

try {
  const project = api(`/v9/projects/${encodeURIComponent(projectId)}`);
  console.log(`\n  Email for ${project.name}, with Resend.\n`);

  if (
    await confirm(
      "Let the crew send email (as the person asking, approving each send)?"
    )
  ) {
    execFileSync("node", ["scripts/setup-connector.mjs", "resend"], {
      stdio: "inherit",
    });
  }

  if (await confirm("Let people email the crew?")) {
    const members = emailMembers();
    if (members.length === 0) {
      fail(
        "No crew member has agent/channels/resend.ts. Copy it from agents/lopsi/."
      );
    }
    await ensureRedis({ api, project, projectId, targets: TARGETS });
    let envs = projectEnvs(api, projectId);
    const { apiKey, domains } = await ensureApiKey(envs);
    envs = projectEnvs(api, projectId);
    const domain = await ensureAddresses(envs, domains);
    const alias = project.targets?.production?.alias?.[0];
    const baseUrl = (
      await ask("Production URL", alias ? `https://${alias}` : undefined)
    ).replace(/\/+$/u, "");
    if (!baseUrl.startsWith("https://")) {
      fail("Enter the production URL, starting with https://.");
    }
    await ensureWebhooks(apiKey, projectEnvs(api, projectId), baseUrl, members);
    console.log(
      `\n  The crew answers ${members.map((member) => memberAddress(member, domain)).join(", ")}.`
    );
  }

  console.log(
    "\n  Deploy to apply (`eve deploy`, or push to main). Email from someone not on LOPSI_EMAIL_SENDERS, or whose domain doesn't pass DMARC, is dropped; the deployment's logs say why.\n"
  );
} catch (error) {
  fail(error.message);
} finally {
  closePrompts();
}
