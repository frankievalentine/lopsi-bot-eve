/**
 * Helpers the setup scripts share: the linked project, and Vercel API calls
 * made through the Vercel CLI so its login and team access apply. Request
 * bodies, which can hold secrets, go on stdin and are never printed.
 */

import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";

/** Prints a message and exits with failure. */
export function fail(message) {
  console.error(`\n  ${message}\n`);
  process.exit(1);
}

/** The project this directory is linked to (`vercel link`). */
export function readLinkedProject() {
  try {
    const { projectId, orgId } = JSON.parse(
      readFileSync(".vercel/project.json", "utf8")
    );
    if (projectId && orgId) {
      return { projectId, team: orgId };
    }
  } catch {
    // Reported below.
  }
  return fail(
    "This directory isn't linked to a Vercel project. Run `vercel link` first."
  );
}

/** A Vercel API caller for one team. Failures carry the CLI's output in `detail`. */
export function createApi(team) {
  return function api(path, { method = "GET", body } = {}) {
    const separator = path.includes("?") ? "&" : "?";
    const args = [
      "api",
      `${path}${separator}teamId=${encodeURIComponent(team)}`,
      "--raw",
    ];
    if (method !== "GET") {
      args.push("-X", method);
    }
    if (body !== undefined) {
      args.push("--input", "-");
    }
    try {
      const output = execFileSync("vercel", args, {
        encoding: "utf8",
        input: body === undefined ? undefined : JSON.stringify(body),
        stdio: ["pipe", "pipe", "pipe"],
      });
      return output.trim() === "" ? undefined : JSON.parse(output);
    } catch (error) {
      const detail = String(error.stdout || error.stderr || error.message);
      const failure = new Error(
        detail.includes("app_limit_reached")
          ? "This team has reached its Vercel App limit. Remove an unused app in team settings and retry."
          : `Vercel API ${method} ${path} failed. Check that you can manage apps and environment variables in this team, or ask a team owner to run setup.`
      );
      failure.detail = detail;
      throw failure;
    }
  };
}

/** The project's environment variables, without branch-specific or custom-environment ones. */
export function projectEnvs(api, projectId) {
  return api(`/v10/projects/${encodeURIComponent(projectId)}/env`).envs.filter(
    (env) => !(env.gitBranch || env.customEnvironmentIds?.length)
  );
}

/** Whether `key` is set for `target` (production, preview, development). */
export function hasEnv(envs, key, target) {
  return envs.some(
    (env) => env.key === key && [env.target].flat().includes(target)
  );
}

/**
 * Saves environment variables on the project. Values travel in the request
 * body (stdin), never on the command line or in output.
 *
 * @param {(path: string, init?: { method?: string, body?: unknown }) => any} api
 * @param {string} projectId
 * @param {{ key: string, target: string[], type: "plain" | "sensitive", value: string }[]} writes
 */
export function saveEnvs(api, projectId, writes) {
  if (writes.length === 0) {
    return;
  }
  const result = api(`/v10/projects/${encodeURIComponent(projectId)}/env`, {
    body: writes,
    method: "POST",
  });
  if (result?.failed?.length) {
    fail(
      `Couldn't save ${writes.map((write) => write.key).join(", ")}. Check the project's environment variables and retry.`
    );
  }
  for (const write of writes) {
    console.log(`  Set ${write.key} (${write.target.join(", ")})`);
  }
}

/**
 * Makes `key` a Secret wherever it's stored in a way the dashboard can show, as
 * some Vercel commands leave what they create. The value is read and written back
 * unchanged through the request body, and is never printed. Development can't
 * hold a Secret, so a variable that includes it stays as it is.
 *
 * @returns {{ converted: number, skipped: number }}
 */
export function protectEnv(api, projectId, key) {
  const project = encodeURIComponent(projectId);
  const rows = projectEnvs(api, projectId).filter(
    (env) => env.key === key && env.type !== "sensitive"
  );
  let converted = 0;
  let skipped = 0;
  for (const row of rows) {
    const target = [row.target].flat();
    const id = encodeURIComponent(row.id);
    const value = target.includes("development")
      ? undefined
      : api(`/v1/projects/${project}/env/${id}`).value;
    if (value) {
      api(`/v9/projects/${project}/env/${id}`, {
        body: { target, type: "sensitive", value },
        method: "PATCH",
      });
      converted += 1;
    } else {
      skipped += 1;
    }
  }
  return { converted, skipped };
}

/** Whether `key` is set for every one of `targets`. */
export function hasEnvEverywhere(envs, key, targets) {
  return targets.every((target) => hasEnv(envs, key, target));
}
