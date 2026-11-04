#!/usr/bin/env node
/**
 * Production mode setup: Sign in with Vercel for members of the project's team.
 *
 * Makes the same Vercel API calls as eve's own Sign in with Vercel setup
 * (`eve add channel/web`), which this template can't run because its channel and
 * auth files carry starter mode: it creates or reuses a Vercel App that only the
 * owning team can sign in to, then writes VERCEL_APP_CLIENT_ID,
 * VERCEL_APP_CLIENT_SECRET and BETTER_AUTH_SECRET to production and preview.
 * The app slug matches eve's, so an app eve created is reused.
 *
 * Then it creates and connects a private Vercel Blob store (BLOB_STORE_ID) that
 * keeps each chat to the person who started it; production mode won't start
 * without it.
 *
 * Safe to re-run: it only fills in what is missing. Secrets travel to the
 * Vercel CLI on stdin and are never printed. Requires the Vercel CLI, logged in,
 * with this directory linked (`vercel link`).
 *
 * Usage: pnpm setup:sign-in
 */

import { execFileSync } from "node:child_process";
import { randomBytes } from "node:crypto";
import { createApi, fail, readLinkedProject, saveEnvs } from "./vercel-api.mjs";

const CALLBACK_PATH = "/api/auth/callback/vercel";
const PROJECT_ID_PREFIX = /^prj_/u;
const NOT_SLUG = /[^a-z0-9-]/gu;
const SCOPES = ["openid", "email", "profile"];
const TARGETS = ["production", "preview"];
const CLIENT_ID = "VERCEL_APP_CLIENT_ID";
const CLIENT_SECRET = "VERCEL_APP_CLIENT_SECRET";
const AUTH_SECRET = "BETTER_AUTH_SECRET";
/** The private Blob store that keeps each chat to the person who started it. */
const OWNER_STORE_KEYS = ["BLOB_STORE_ID", "BLOB_READ_WRITE_TOKEN"];

function findApp(idOrSlug) {
  try {
    return api(`/oauth-apps/${encodeURIComponent(idOrSlug)}`).app;
  } catch (error) {
    if (
      error.detail?.includes("invalid_client") ||
      error.detail?.includes("not_found")
    ) {
      return;
    }
    throw error;
  }
}

function assertTeamOnlyApp(app) {
  const matches =
    app.teamId === team &&
    app.signInFrom === "owning-team" &&
    app.grantTypes?.authorization_code &&
    app.clientAuthenticationMethods?.client_secret_post &&
    SCOPES.every((scope) => app.scopes?.includes(scope)) &&
    app.projectRedirectUris?.some(
      (uri) => uri.projectId === projectId && uri.path === CALLBACK_PATH
    );
  if (!matches) {
    fail(
      `The Vercel App ${app.clientId} doesn't have this project's team-only sign-in settings. ` +
        "Check it in team settings, or remove the VERCEL_APP_* variables and retry."
    );
  }
}

const { projectId, team } = readLinkedProject();
const api = createApi(team);

try {
  const project = api(`/v9/projects/${encodeURIComponent(projectId)}`);
  if (project.id !== projectId || project.accountId !== team) {
    fail("The linked Vercel project isn't available in its team.");
  }

  const envs = api(
    `/v10/projects/${encodeURIComponent(projectId)}/env`
  ).envs.filter((env) => !(env.gitBranch || env.customEnvironmentIds?.length));
  const forTarget = (key, target) =>
    envs.find((env) => env.key === key && [env.target].flat().includes(target));
  const missingTargets = (key) =>
    TARGETS.filter((target) => !forTarget(key, target));

  const configuredIds = new Set(
    TARGETS.map((target) => forTarget(CLIENT_ID, target)?.value).filter(Boolean)
  );
  if (configuredIds.size > 1) {
    fail(
      `Production and preview have different ${CLIENT_ID} values. Make them match and retry.`
    );
  }

  if (
    [CLIENT_ID, CLIENT_SECRET, AUTH_SECRET].every(
      (key) => missingTargets(key).length === 0
    )
  ) {
    const [configuredId] = configuredIds;
    const app = configuredId ? findApp(configuredId) : undefined;
    if (!app) {
      fail(
        `The Vercel App in ${CLIENT_ID} is unavailable. Check it before retrying.`
      );
    }
    assertTeamOnlyApp(app);
    console.log(
      `  Sign in with Vercel: already configured (app ${app.clientId}, team members only)`
    );
  } else {
    configureSignIn(project, configuredIds, missingTargets);
  }

  ensureOwnerStore(project, forTarget);

  console.log(
    "\n  Production mode is configured. Run `eve deploy` to publish it.\n"
  );
} catch (error) {
  fail(error.message);
}

/** Creates or reuses the team-only Vercel App and writes its missing credentials. */
function configureSignIn(project, configuredIds, missingTargets) {
  const suffix = projectId.replace(PROJECT_ID_PREFIX, "").toLowerCase();
  const slug = `${project.name.slice(0, 100)}-web-chat-${suffix}`
    .toLowerCase()
    .replace(NOT_SLUG, "-");
  const [configuredId] = configuredIds;
  let app = findApp(configuredId ?? slug);
  if (!app && configuredId) {
    fail(
      `The Vercel App in ${CLIENT_ID} is unavailable. Check it before retrying.`
    );
  }
  if (app) {
    console.log(`  Reusing Vercel App ${app.clientId}`);
  } else {
    ({ app } = api("/oauth-apps", {
      body: {
        clientAuthenticationMethods: { client_secret_post: true },
        grantTypes: { authorization_code: true },
        name: `${project.name.slice(0, 100)} Web Chat ${suffix}`,
        projectRedirectUris: [{ path: CALLBACK_PATH, projectId }],
        scopes: SCOPES,
        signInFrom: "owning-team",
        slug,
      },
      method: "POST",
    }));
    console.log(`  Created Vercel App ${app.clientId} (team members only)`);
  }
  assertTeamOnlyApp(app);

  const values = {
    [AUTH_SECRET]: randomBytes(32).toString("base64url"),
    [CLIENT_ID]: app.clientId,
  };
  if (missingTargets(CLIENT_SECRET).length > 0) {
    if ((app.clientSecrets?.length ?? 0) >= 2) {
      fail(
        "This Vercel App already has two client secrets. Remove an unused one in team settings and retry."
      );
    }
    values[CLIENT_SECRET] = api(
      `/v1/apps/${encodeURIComponent(app.clientId)}/secrets`,
      {
        body: {},
        method: "POST",
      }
    ).clientSecret;
  }

  const writes = [CLIENT_ID, CLIENT_SECRET, AUTH_SECRET]
    .filter((key) => missingTargets(key).length > 0)
    .map((key) => ({
      key,
      target: missingTargets(key),
      type: key === CLIENT_ID ? "plain" : "sensitive",
      value: values[key],
    }));
  saveEnvs(api, projectId, writes);
}

/**
 * Creates and connects the chat owner store when production and preview have
 * neither BLOB_STORE_ID nor BLOB_READ_WRITE_TOKEN. Blob usage may incur charges.
 */
function ensureOwnerStore(project, forTarget) {
  const connected = (target) =>
    OWNER_STORE_KEYS.some((key) => forTarget(key, target));
  if (TARGETS.every(connected)) {
    console.log("  Chat owner store: already connected");
    return;
  }
  const name = `${project.name.slice(0, 40)}-chat-owners`
    .toLowerCase()
    .replace(NOT_SLUG, "-");
  console.log(
    `  Creating private Blob store ${name} for chat owners (Blob usage may incur charges)`
  );
  try {
    execFileSync(
      "vercel",
      [
        "blob",
        "create-store",
        name,
        "--access",
        "private",
        "--yes",
        ...TARGETS.flatMap((target) => ["--environment", target]),
      ],
      { stdio: ["ignore", "inherit", "inherit"] }
    );
  } catch {
    fail(
      "Could not create the chat owner store. Create a private Blob store connected to production and preview, then retry."
    );
  }
  const after = api(`/v10/projects/${encodeURIComponent(projectId)}/env`).envs;
  const nowConnected = (target) =>
    OWNER_STORE_KEYS.some((key) =>
      after.some(
        (env) => env.key === key && [env.target].flat().includes(target)
      )
    );
  if (!TARGETS.every(nowConnected)) {
    fail(
      "The Blob store was created but isn't connected to production and preview. Connect it in the project's Storage settings and retry."
    );
  }
  console.log("  Chat owner store: connected to production and preview");
}
