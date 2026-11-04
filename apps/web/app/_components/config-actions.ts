"use server";

import { ConnectError } from "@vercel/connect";
import { z } from "zod";
import { isModelId, MAX_FALLBACKS, REASONING_LEVELS } from "@/lib/agent-model";
import {
  ConfigConflictError,
  type MemberConfig,
  memberEditFiles,
  newMemberFiles,
  readMemberConfig,
} from "@/lib/config-changes";
import { connectorCatalog } from "@/lib/connectors";
import { CrewSchema } from "@/lib/crew-core.mjs";
import { currentAccount } from "@/lib/current-account";
import {
  BRANCH_PREFIX,
  configChangesUnavailable,
  GitHubError,
  openDashboardPullRequests,
  openPullRequest,
  type PullRequest,
  snapshotOf,
  targetRepository,
} from "@/lib/github";

/** What a dashboard change request returns: the pull request, or why there isn't one. */
export type ChangeResult =
  | { readonly ok: true; readonly pull: PullRequest }
  | { readonly ok: false; readonly error: string };

const ModelSchema = z.object({
  fallbacks: z
    .array(
      z.string().refine(isModelId, "Fallback models are provider/model ids.")
    )
    .max(MAX_FALLBACKS)
    .optional(),
  model: z.string().refine(isModelId, "Choose a model from the list."),
  reasoning: z.enum(REASONING_LEVELS).optional(),
});

const SwitchSchema = z.enum(["on", "off"]);

const AccessSchema = z.object({
  bash: SwitchSchema.optional(),
  sandboxDomains: z.array(z.string().max(253)).max(20).optional(),
  webFetch: z.enum(["off", "always", "once", "never"]).optional(),
  webSearch: SwitchSchema.optional(),
});

const MemberConfigSchema = z.object({
  access: AccessSchema.optional(),
  crew: CrewSchema,
  instructions: z.string().max(50_000).optional(),
  model: ModelSchema.optional(),
});

/**
 * Who is asking, for the pull request's description: a name only, since the
 * repository may be public. Local development edits files directly, so it gets
 * no change requests.
 */
async function requester(): Promise<string | undefined> {
  const account = await currentAccount();
  if (typeof account === "string" || account.kind === "open") {
    return;
  }
  return account.kind === "vercel"
    ? account.name
    : "the crew operator (shared password)";
}

function failure(error: unknown): { ok: false; error: string } {
  if (error instanceof ConfigConflictError || error instanceof z.ZodError) {
    return {
      error:
        error instanceof z.ZodError ? z.prettifyError(error) : error.message,
      ok: false,
    };
  }
  // Vercel Connect needs the project's OIDC token: present on Vercel, and
  // locally after `vercel link` and `vercel env pull`.
  if (
    error instanceof Error &&
    (error.name === "VercelOidcTokenError" ||
      error.constructor.name === "VercelOidcTokenError")
  ) {
    return {
      error:
        "This server has no Vercel OIDC token, so it can't reach GitHub through Vercel Connect. Locally, run `vercel link` and `vercel env pull .env.local`.",
      ok: false,
    };
  }
  if (error instanceof ConnectError) {
    return {
      error: `Vercel Connect couldn't give the dashboard a GitHub token (${error.message}). Check GITHUB_CONNECTOR and that its GitHub App is installed on the repository.`,
      ok: false,
    };
  }
  if (error instanceof GitHubError) {
    return { error: `GitHub: ${error.message}`, ok: false };
  }
  // Unexpected: keep the cause in the server log, not in the browser.
  console.error("[lopsi] configuration change failed:", error);
  return { error: "That didn't go through. Try again.", ok: false };
}

function branchName(subject: string): string {
  const stamp = new Date().toISOString().replace(/[-:T]/gu, "").slice(0, 14);
  return `${BRANCH_PREFIX}${subject}-${stamp}`;
}

function pullBody(
  who: string,
  summary: string,
  files: readonly string[]
): string {
  return [
    `${summary}`,
    "",
    `Requested by ${who} in the Lopsi dashboard.`,
    "",
    "Files:",
    ...files.map((file) => `- ${file}`),
    "",
    "Nothing changes until this is merged; Vercel deploys the merge as usual.",
  ].join("\n");
}

/** A crew member's configuration as it is on the branch, to edit. */
export async function loadMemberConfig(
  memberId: string
): Promise<{ ok: true; config: MemberConfig } | { ok: false; error: string }> {
  const target = targetRepository();
  if (
    (await requester()) === undefined ||
    target === undefined ||
    configChangesUnavailable() !== undefined
  ) {
    return {
      error: configChangesUnavailable() ?? "Changes aren't available here.",
      ok: false,
    };
  }
  try {
    const config = await readMemberConfig(await snapshotOf(target), memberId);
    return config === undefined
      ? { error: "This crew member isn't on the branch.", ok: false }
      : { config, ok: true };
  } catch (error) {
    return failure(error);
  }
}

/** Opens a pull request that changes one crew member from `from` to `to`. */
export async function proposeMemberEdit(
  memberId: string,
  from: unknown,
  to: unknown
): Promise<ChangeResult> {
  const who = await requester();
  const target = targetRepository();
  if (
    who === undefined ||
    target === undefined ||
    configChangesUnavailable() !== undefined
  ) {
    return {
      error: configChangesUnavailable() ?? "Changes aren't available here.",
      ok: false,
    };
  }
  try {
    const before = MemberConfigSchema.parse(from);
    const after = MemberConfigSchema.parse(to);
    const snapshot = await snapshotOf(target);
    const files = await memberEditFiles(snapshot, memberId, before, after);
    if (Object.keys(files).length === 0) {
      return { error: "Nothing changed.", ok: false };
    }
    const pull = await openPullRequest(target, snapshot.commit, {
      body: pullBody(
        who,
        `Updates the **${after.crew.name}** crew member (\`agents/${memberId}\`).`,
        Object.entries(files).map(([path, content]) =>
          content === null ? `\`${path}\` (removed)` : `\`${path}\``
        )
      ),
      branch: branchName(memberId),
      files,
      title: `Update ${after.crew.name} (${memberId})`,
    });
    return { ok: true, pull };
  } catch (error) {
    return failure(error);
  }
}

const NewMemberSchema = z.object({
  config: z.object({
    crew: CrewSchema,
    instructions: z
      .string()
      .trim()
      .min(1, "Write some instructions.")
      .max(50_000),
    model: ModelSchema,
  }),
  id: z.string(),
});

/** Opens a pull request that adds a crew member under agents/<id>/. */
export async function proposeNewMember(input: unknown): Promise<ChangeResult> {
  const who = await requester();
  const target = targetRepository();
  if (
    who === undefined ||
    target === undefined ||
    configChangesUnavailable() !== undefined
  ) {
    return {
      error: configChangesUnavailable() ?? "Changes aren't available here.",
      ok: false,
    };
  }
  try {
    const { config, id } = NewMemberSchema.parse(input);
    const snapshot = await snapshotOf(target);
    const files = await newMemberFiles(snapshot, id, config);
    const pull = await openPullRequest(target, snapshot.commit, {
      body: pullBody(
        who,
        `Adds **${config.crew.name}** to the crew (\`agents/${id}\`).`,
        Object.keys(files).map((path) => `\`${path}\``)
      ),
      branch: branchName(id),
      files,
      title: `Add ${config.crew.name} to the crew (${id})`,
    });
    return { ok: true, pull };
  } catch (error) {
    return failure(error);
  }
}

/** The dashboard's open pull requests against this deployment's branch. */
export async function pendingChanges(): Promise<
  { ok: true; pulls: readonly PullRequest[] } | { ok: false; error: string }
> {
  const target = targetRepository();
  if (
    (await requester()) === undefined ||
    target === undefined ||
    configChangesUnavailable() !== undefined
  ) {
    return {
      error: configChangesUnavailable() ?? "Changes aren't available here.",
      ok: false,
    };
  }
  try {
    return { ok: true, pulls: await openDashboardPullRequests(target) };
  } catch (error) {
    return failure(error);
  }
}

interface ModelOption {
  readonly id: string;
  readonly name: string;
}

let modelCache: { at: number; models: readonly ModelOption[] } | undefined;
const MODEL_CACHE_MS = 60 * 60 * 1000;

/** AI Gateway's language models, for the model picker. Cached for an hour. */
export async function modelOptions(): Promise<readonly ModelOption[]> {
  if (modelCache && Date.now() - modelCache.at < MODEL_CACHE_MS) {
    return modelCache.models;
  }
  try {
    const response = await fetch("https://ai-gateway.vercel.sh/v1/models");
    const { data } = (await response.json()) as {
      data: { id: string; name?: string; type?: string }[];
    };
    const models = data
      .filter((model) => model.type === "language" && isModelId(model.id))
      .map((model) => ({ id: model.id, name: model.name ?? model.id }))
      .sort((a, b) => a.id.localeCompare(b.id));
    modelCache = { at: Date.now(), models };
    return models;
  } catch {
    return modelCache?.models ?? [];
  }
}

/** The connectors a crew member can be limited to, for the Edit dialog. Names only. */
export async function connectorChoices(): Promise<
  readonly {
    readonly configured: boolean;
    readonly id: string;
    readonly name: string;
  }[]
> {
  if (typeof (await currentAccount()) === "string") {
    return [];
  }
  return connectorCatalog().map(({ configured, id, name }) => ({
    configured,
    id,
    name,
  }));
}
