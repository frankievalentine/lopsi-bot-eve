/**
 * Upstash for Redis from the Vercel Marketplace, for Chat SDK thread state
 * (email and every other channel share one store; each keys its own prefix).
 */

import { execFileSync } from "node:child_process";
import { ask, confirm } from "./prompt.mjs";
import { fail, hasEnvEverywhere, projectEnvs } from "./vercel-api.mjs";

const REDIS_KEYS = ["REDIS_URL", "KV_URL"];
const NOT_SLUG = /[^a-z0-9-]/gu;

/**
 * Connects Upstash for Redis to production and preview, unless a Redis URL is
 * there already. Asks first; stops setup if the answer is no.
 */
export async function ensureRedis({ api, project, projectId, targets }) {
  const connected = (envs) =>
    REDIS_KEYS.some((key) => hasEnvEverywhere(envs, key, targets));
  if (connected(projectEnvs(api, projectId))) {
    console.log("  Thread state: Redis already connected");
    return;
  }
  console.log(
    "\n  Conversations need a Redis store for their threads. This adds Upstash for Redis from the Vercel Marketplace (it has a free plan) and connects it to the project."
  );
  if (!(await confirm("Add Upstash for Redis now?"))) {
    fail(
      "This needs Redis. Re-run when you're ready, or connect a Redis store yourself (REDIS_URL)."
    );
  }
  const region = await ask("Primary region", "iad1");
  const name = `${project.name.slice(0, 40)}-chat-state`
    .toLowerCase()
    .replace(NOT_SLUG, "-");
  execFileSync(
    "vercel",
    [
      "integration",
      "add",
      "upstash/upstash-kv",
      "--name",
      name,
      "--meta",
      `primaryRegion=${region}`,
      ...targets.flatMap((target) => ["--environment", target]),
    ],
    { stdio: "inherit" }
  );
  if (!connected(projectEnvs(api, projectId))) {
    fail(
      "Upstash was added but no REDIS_URL or KV_URL reached production and preview. Connect the store to the project in its Storage settings, then re-run."
    );
  }
  console.log("  Thread state: Upstash Redis connected");
}
