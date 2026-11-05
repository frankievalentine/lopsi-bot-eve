"use server";

import { getVercelOidcToken } from "@vercel/oidc";
import { isConfigured } from "@/lib/channel-core.mjs";
import channelCatalog from "@/lib/channels.json";
import { currentAccount } from "@/lib/current-account";
import { isDemo } from "@/lib/demo";
import { targetRepository } from "@/lib/github";
import {
  planRemoval,
  type RemovalItem,
  type RemovalPlan,
  type RemovalStep,
  runRemoval,
  VercelCallError,
  vercelCaller,
} from "@/lib/project-removal";

/** Something the app can't remove, for the person to do afterward. */
export interface ManualStep {
  readonly hint: string;
  readonly href?: string;
  readonly label: string;
}

const failure = (error: string) => ({ error, ok: false as const });

/** This deployment's project and team. */
async function deploymentTarget(): Promise<
  { projectId: string; teamId: string } | undefined
> {
  const projectId = process.env.VERCEL_PROJECT_ID;
  if (projectId === undefined) {
    return;
  }
  const [, payload] = (await getVercelOidcToken()).split(".");
  const { owner_id: teamId } = JSON.parse(
    Buffer.from(payload ?? "", "base64url").toString()
  ) as { owner_id?: string };
  return teamId ? { projectId, teamId } : undefined;
}

/** Only someone signed in on a production deployment gets as far as the token. */
async function allowed(): Promise<boolean> {
  if (isDemo || process.env.VERCEL_ENV !== "production") {
    return false;
  }
  const account = await currentAccount();
  return typeof account !== "string" && account.kind !== "open";
}

function explain(error: unknown): string {
  if (error instanceof VercelCallError) {
    return error.status === 401 || error.status === 403 || error.status === 404
      ? "That token can't reach this project. Use a token for this project's team, or for this project."
      : "Vercel didn't accept that. Try again in a moment.";
  }
  return "Couldn't reach Vercel. Try again in a moment.";
}

/** What's outside Vercel's reach or its public API, from how this deployment is set up. */
function manualSteps(plan: RemovalPlan): readonly ManualStep[] {
  const repository = targetRepository();
  const channels = channelCatalog.filter((entry) =>
    isConfigured(entry.env.map((variable) => variable.name))
  );
  const storage =
    "https://vercel.com/d?to=%2F%5Bteam%5D%2F%7E%2Fstores&title=Go+to+Storage";
  return [
    ...(repository
      ? [
          {
            hint: `${repository.owner}/${repository.repo}, at the bottom of its settings`,
            href: `https://github.com/${repository.owner}/${repository.repo}/settings`,
            label: "Delete the GitHub Repository",
          },
        ]
      : []),
    ...(process.env.GITHUB_CONNECTOR
      ? [
          {
            hint: "The app that opened pull requests",
            href: "https://github.com/settings/installations",
            label: "Uninstall the GitHub App",
          },
        ]
      : []),
    ...(process.env.VERCEL_APP_CLIENT_ID
      ? [
          {
            hint: "Used for sign-in; it's in team settings",
            href: "https://vercel.com/d?to=%2F%5Bteam%5D%2F%7E%2Fsettings&title=Go+to+Team+Settings",
            label: "Delete the Vercel App",
          },
        ]
      : []),
    ...(plan.limited
      ? [
          {
            hint: "Your token couldn't reach them. They may include chat history, and may keep billing.",
            href: storage,
            label: "Check for Stores",
          },
          {
            hint: "Your token couldn't reach them.",
            href: "https://vercel.com/d?to=/%5Bteam%5D/~/connect&title=Go+to+Connect",
            label: "Check for Connectors",
          },
        ]
      : []),
    ...plan.stores.map((name) => ({
      hint: `${name}, which may keep billing until you do`,
      href: storage,
      label: "Delete the Store",
    })),
    ...(process.env.RESEND_API_KEY
      ? [
          {
            hint: "Webhooks and API key, and the receiving domain if nothing else uses it",
            href: "https://resend.com/webhooks",
            label: "Clean Up Resend",
          },
        ]
      : []),
    ...channels.map((entry) => ({
      hint: `In your ${entry.name} dashboard`,
      label: `Remove the ${entry.name} Webhook`,
    })),
  ];
}

/** What removing this project would do, for the person to review. */
export async function previewRemoval(token: string): Promise<
  | {
      readonly manual: readonly ManualStep[];
      readonly ok: true;
      readonly plan: RemovalPlan;
    }
  | { readonly error: string; readonly ok: false }
> {
  if (!(await allowed())) {
    return failure("This deployment can't be removed from here.");
  }
  try {
    const target = await deploymentTarget();
    if (target === undefined) {
      return failure("Couldn't tell which project this is.");
    }
    const plan = await planRemoval(
      vercelCaller(token, target.teamId),
      target.projectId
    );
    return { manual: manualSteps(plan), ok: true, plan };
  } catch (error) {
    return failure(explain(error));
  }
}

/**
 * Removes the project, once the person has typed its name, and whichever
 * reviewed items they left checked. The plan is worked out again here, so only
 * what's still this project's alone can be removed.
 */
export async function removeProject(input: {
  readonly confirmation: string;
  readonly itemIds: readonly string[];
  readonly token: string;
}): Promise<
  | { readonly ok: true; readonly steps: readonly RemovalStep[] }
  | { readonly error: string; readonly ok: false }
> {
  if (!(await allowed())) {
    return failure("This deployment can't be removed from here.");
  }
  try {
    const target = await deploymentTarget();
    if (target === undefined) {
      return failure("Couldn't tell which project this is.");
    }
    const call = vercelCaller(input.token, target.teamId);
    const plan = await planRemoval(call, target.projectId);
    if (input.confirmation !== plan.projectName) {
      return failure("That isn't this project's name.");
    }
    const chosen = new Set(input.itemIds);
    const items: readonly RemovalItem[] = plan.removable.filter((item) =>
      chosen.has(item.id)
    );
    return {
      ok: true,
      steps: await runRemoval(call, target.projectId, plan, items),
    };
  } catch (error) {
    return failure(explain(error));
  }
}
