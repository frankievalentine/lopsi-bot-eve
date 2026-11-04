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
