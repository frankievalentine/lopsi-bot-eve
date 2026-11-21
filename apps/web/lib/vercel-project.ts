/**
 * This deployment's Vercel project and team, from its OIDC token's claims, so
 * it also works locally after `vercel env pull`.
 *
 * @packageDocumentation
 */

import { getVercelOidcToken } from "@vercel/oidc";

export interface DeploymentTarget {
  readonly projectId: string;
  readonly teamId: string;
}

/** This deployment's project and team, or `undefined` without an OIDC token. */
export async function deploymentTarget(): Promise<
  DeploymentTarget | undefined
> {
  let token: string;
  try {
    token = await getVercelOidcToken();
  } catch {
    return;
  }
  const [, payload] = token.split(".");
  const claims = JSON.parse(
    Buffer.from(payload ?? "", "base64url").toString()
  ) as { owner_id?: string; project_id?: string };
  const projectId = process.env.VERCEL_PROJECT_ID ?? claims.project_id;
  const teamId = claims.owner_id;
  return projectId && teamId ? { projectId, teamId } : undefined;
}

const API = "https://api.vercel.com";

/** A Vercel API call that didn't succeed, with the status it answered. */
export class VercelApiError extends Error {
  readonly status: number;
  constructor(status: number, path: string) {
    super(`Vercel answered ${status} for ${path}.`);
    this.name = "VercelApiError";
    this.status = status;
  }
}

/** Calls the Vercel API with `VERCEL_TOKEN`, on this deployment's team. */
export async function vercelApi(
  target: DeploymentTarget,
  path: string,
  init?: { readonly body?: unknown; readonly method?: "PATCH" | "POST" }
): Promise<unknown> {
  const token = process.env.VERCEL_TOKEN?.trim();
  if (!token) {
    throw new Error("VERCEL_TOKEN isn't set.");
  }
  const separator = path.includes("?") ? "&" : "?";
  const response = await fetch(
    `${API}${path}${separator}teamId=${encodeURIComponent(target.teamId)}`,
    {
      headers: {
        Authorization: `Bearer ${token}`,
        ...(init?.body === undefined
          ? {}
          : { "Content-Type": "application/json" }),
      },
      ...(init?.method ? { method: init.method } : {}),
      ...(init?.body === undefined ? {} : { body: JSON.stringify(init.body) }),
    }
  );
  if (!response.ok) {
    throw new VercelApiError(response.status, path);
  }
  const text = await response.text();
  return text ? JSON.parse(text) : undefined;
}

/** Sets a plain variable for production and preview, which applies from the next deployment. */
export async function setProjectVariable(
  target: DeploymentTarget,
  key: string,
  value: string
): Promise<void> {
  await vercelApi(
    target,
    `/v10/projects/${encodeURIComponent(target.projectId)}/env?upsert=true`,
    {
      body: { key, target: ["production", "preview"], type: "plain", value },
      method: "POST",
    }
  );
}

/** Deploys production again from this deployment's source, so new variables apply. */
export async function redeploy(target: DeploymentTarget): Promise<void> {
  const deploymentId = process.env.VERCEL_DEPLOYMENT_ID;
  if (!deploymentId) {
    throw new Error("This deployment's id isn't known.");
  }
  const { name } = (await vercelApi(
    target,
    `/v9/projects/${encodeURIComponent(target.projectId)}`
  )) as { name: string };
  await vercelApi(target, "/v13/deployments?forceNew=1", {
    body: { deploymentId, name, target: "production" },
    method: "POST",
  });
}
