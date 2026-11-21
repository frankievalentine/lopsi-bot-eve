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
