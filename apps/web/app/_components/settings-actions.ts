"use server";

import { headers } from "next/headers";
import { type AccessMode, accessMode } from "@/lib/access";
import { type MemberSetupResult, memberSetup } from "@/lib/agent-info";
import { isConfigured } from "@/lib/channel-core.mjs";
import channelCatalog from "@/lib/channels.json";
import { connectorCatalog } from "@/lib/connectors";
import { CREW } from "@/lib/crew";
import { currentAccount } from "@/lib/current-account";
import { isDemo } from "@/lib/demo";
import { emailSetup } from "@/lib/email";
import { configChangesUnavailable, targetRepository } from "@/lib/github";
import { isProductionMode } from "@/lib/production-mode";
import { sessionBudgetUsd } from "@/lib/session-budget";

/** How this deployment is set up, as the Settings dialog shows it. */
export interface SettingsStatus {
  readonly access: AccessMode | "demo";
  readonly budgetUsd: number;
  readonly catalog: readonly {
    readonly configured: boolean;
    readonly description: string;
    readonly id: string;
    readonly name: string;
    readonly variable: string;
  }[];
  /** The messaging channels in apps/web/lib/channels.json, and whether each is set up. */
  readonly channels: readonly {
    readonly configured: boolean;
    readonly description: string;
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
  /** Whether someone can remove this project from Settings: production only. */
  readonly removable: boolean;
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

/** The demo's example setup: nothing here is read from a deployment. */
function demoSettings() {
  const active = new Set(["linear", "notion"]);
  return {
    ok: true as const,
    setups: Object.fromEntries(
      CREW.map((member) => [
        member.id,
        {
          ok: true as const,
          setup: {
            channels: [],
            connections: [...active].map((name) => ({ approval: true, name })),
            diagnostics: { errors: 0, warnings: 0 },
            sandbox: "vercel",
            schedules: [],
            skills: [],
            subagents: [],
          },
        },
      ])
    ),
    status: {
      access: "demo" as const,
      budgetUsd: 1,
      catalog: connectorCatalog().map((entry) => ({
        ...entry,
        configured: active.has(entry.id),
      })),
      channels: channelCatalog.map((entry) => ({
        configured: false,
        description: entry.description,
        id: entry.id,
        name: entry.name,
      })),
      email: { lopsi: "lopsi@example.com" },
      emailSenders: 0,
      github: true,
      history: false,
      local: false,
      removable: false,
      repository: "frankievalentine/lopsi-bot-eve@main",
    },
  };
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
  if (isDemo) {
    return demoSettings();
  }
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
        description: entry.description,
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
      removable:
        account.kind !== "open" && process.env.VERCEL_ENV === "production",
      ...(repository === undefined
        ? {}
        : {
            repository: `${repository.owner}/${repository.repo}@${repository.branch}`,
          }),
    },
  };
}
