/**
 * Each crew member's effective setup, from its deployed agent's operator-only
 * `/info` route, called server-side with the deployment's OIDC token (a
 * `runtime` caller). The token also goes as `x-vercel-trusted-oidc-idp-token`,
 * so Deployment Protection on previews lets it through.
 *
 * @packageDocumentation
 */

import { getVercelOidcToken } from "@vercel/oidc";
import { type AgentInfoResult, Client } from "eve/client";

/** What the settings page shows for one crew member. Serializable. */
export interface MemberSetup {
  readonly connections: readonly {
    readonly approval: boolean;
    readonly name: string;
  }[];
  readonly diagnostics: { readonly errors: number; readonly warnings: number };
  readonly hooks: readonly string[];
  readonly model: string;
  readonly reasoning?: string;
  readonly sandbox?: string;
  readonly schedules: readonly string[];
  readonly skills: readonly string[];
  readonly subagents: readonly string[];
  readonly tools: readonly {
    readonly approval: boolean;
    readonly name: string;
  }[];
}

export type MemberSetupResult =
  | { readonly ok: true; readonly setup: MemberSetup }
  | { readonly ok: false; readonly error: string };

function summarize(info: AgentInfoResult): MemberSetup {
  const { model } = info.agent;
  return {
    connections: info.connections.map((connection) => ({
      approval: connection.hasApproval,
      name: connection.connectionName,
    })),
    diagnostics: {
      errors: info.diagnostics.discoveryErrors,
      warnings: info.diagnostics.discoveryWarnings,
    },
    hooks: info.hooks.map((hook) => hook.slug),
    model: ("id" in model ? model.id : undefined) ?? "unknown",
    schedules: info.schedules.map((schedule) => schedule.name),
    skills: info.skills.static.map((skill) => skill.name),
    subagents: info.subagents.local.map((subagent) => subagent.name),
    tools: info.tools.static.map((tool) => ({
      approval: tool.requiresApproval,
      name: tool.name,
    })),
    ...(model.reasoning === undefined ? {} : { reasoning: model.reasoning }),
    ...(info.sandbox.provider === undefined
      ? {}
      : { sandbox: info.sandbox.provider }),
  };
}

/** The deployment's OIDC token; none locally without `vercel env pull`, where `localDev()` admits the call. */
async function oidcToken(): Promise<string | undefined> {
  try {
    return await getVercelOidcToken();
  } catch {
    return undefined;
  }
}

/** A crew member's effective setup, or why it couldn't be read. */
export async function memberSetup(
  origin: string,
  memberId: string
): Promise<MemberSetupResult> {
  const token = await oidcToken();
  const client = new Client({
    baseUrl: `${origin}/eve/${encodeURIComponent(memberId)}`,
    redirect: "manual",
    ...(token === undefined
      ? {}
      : { auth: { vercelOidc: { token: () => Promise.resolve(token) } } }),
  });
  try {
    return { ok: true, setup: summarize(await client.info()) };
  } catch (error) {
    return {
      error:
        error instanceof Error ? error.message : "Couldn't read its setup.",
      ok: false,
    };
  }
}
