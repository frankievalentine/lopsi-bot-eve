"use server";

import { headers } from "next/headers";
import { type AccessMode, accessMode } from "@/lib/access";
import { type MemberSetupResult, memberSetup } from "@/lib/agent-info";
import { isConfigured } from "@/lib/channel-core.mjs";
import channelCatalog from "@/lib/channels.json";
import { connectorCatalog } from "@/lib/connectors";
import { CREW } from "@/lib/crew.generated";
import { currentAccount } from "@/lib/current-account";
import { emailSetup } from "@/lib/email";
import { configChangesUnavailable, targetRepository } from "@/lib/github";
import { isProductionMode } from "@/lib/production-mode";
import { sessionBudgetUsd } from "@/lib/session-budget";

/** How this deployment is set up, as the Settings dialog shows it. */
export interface SettingsStatus {
  readonly access: AccessMode;
  readonly budgetUsd: number;
  readonly catalog: readonly {
    readonly configured: boolean;
    readonly id: string;
    readonly name: string;
    readonly variable: string;
  }[];
  /** The messaging channels in apps/web/lib/channels.json, and whether each is set up. */
  readonly channels: readonly {
    readonly configured: boolean;
    readonly id: string;
    readonly name: string;
  }[];
  /** Each member's email address, for members that answer email. */
  readonly email: Readonly<Record<string, string>>;
  /** How many entries LOPSI_EMAIL_SENDERS has. */
  readonly emailSenders: number;
  /** Whether the GitHub connector and target repository are set up. */
  readonly github: boolean;
  /** Whether chat history and ownership are kept on the server. */
  readonly history: boolean;
  /** Local development: changes are made in the files, not by pull request. */
  readonly local: boolean;
  /** `owner/repo@branch` that pull requests go to. */
  readonly repository?: string;
}

/** This request's origin, so the server can call the deployed agents. */
async function originOf(): Promise<string> {
  const list = await headers();
  const host = list.get("x-forwarded-host") ?? list.get("host") ?? "localhost";
  const protocol =
    list.get("x-forwarded-proto") ??
    (host.startsWith("localhost") ? "http" : "https");
  return `${protocol}://${host}`;
}

/**
 * What the Settings dialog shows: how this deployment is set up, and each crew
 * member's effective setup from its deployed agent's `/info`.
 */
export async function loadSettings(): Promise<
  | {
      readonly ok: true;
      readonly setups: Readonly<Record<string, MemberSetupResult>>;
      readonly status: SettingsStatus;
    }
  | { readonly ok: false; readonly error: string }
> {
  const account = await currentAccount();
  if (typeof account === "string") {
    return { error: "Sign in to see settings.", ok: false };
  }
  const origin = await originOf();
  const setups = await Promise.all(
    CREW.map(
      async (member) =>
        [member.id, await memberSetup(origin, member.id)] as const
    )
  );
  const repository = targetRepository();
  return {
    ok: true,
    setups: Object.fromEntries(setups),
    status: {
      access: accessMode(),
      budgetUsd: sessionBudgetUsd(),
      catalog: connectorCatalog(),
      channels: channelCatalog.map((entry) => ({
        configured: isConfigured(entry.env.map((variable) => variable.name)),
        id: entry.id,
        name: entry.name,
      })),
      email: Object.fromEntries(
        CREW.flatMap((member) => {
          const address = emailSetup(member.id)?.address;
          return address ? [[member.id, address]] : [];
        })
      ),
      emailSenders: (process.env.LOPSI_EMAIL_SENDERS ?? "")
        .split(",")
        .filter((entry) => entry.trim()).length,
      github: configChangesUnavailable() === undefined,
      history: isProductionMode(),
      local: account.kind === "open",
      ...(repository === undefined
        ? {}
        : {
            repository: `${repository.owner}/${repository.repo}@${repository.branch}`,
          }),
    },
  };
}
