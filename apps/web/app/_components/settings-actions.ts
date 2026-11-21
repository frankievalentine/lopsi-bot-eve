"use server";

import { headers } from "next/headers";
import { type AccessMode, accessMode } from "@/lib/access";
import { type MemberSetupResult, memberSetup } from "@/lib/agent-info";
import { approvedDomains, revokeDomain } from "@/lib/connector-domains";
import {
  CHAT_SERVICES,
  type ChatService,
  type Connector,
  type ConnectorsUnavailable,
  chatPath,
  connectorListing,
  sendEventsTo,
} from "@/lib/connectors";
import { CREW } from "@/lib/crew";
import { currentAccount } from "@/lib/current-account";
import { isDemo } from "@/lib/demo";
import { emailSetup } from "@/lib/email";
import { configChangesUnavailable, targetRepository } from "@/lib/github";
import { isProductionMode } from "@/lib/production-mode";
import { sessionBudgetUsd } from "@/lib/session-budget";
import {
  checkForUpdate,
  TEMPLATE_VERSION,
  type TemplateUpdate,
} from "@/lib/template-version";

/** How this deployment is set up, as the Settings dialog shows it. */
export interface SettingsStatus {
  readonly access: AccessMode | "demo";
  readonly budgetUsd: number;
  /** The Vercel Connect connectors attached to this project, or why they can't be listed. */
  readonly connectors:
    | { readonly list: readonly Integration[]; readonly ok: true }
    | { readonly ok: false; readonly reason: ConnectorsUnavailable };
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
  /** A newer release of the template, if GitHub reports one. */
  readonly update?: TemplateUpdate;
  /** The template version this deployment is built from. */
  readonly version: string;
}

/** A connector as Settings shows it. */
export interface Integration {
  /** Chatting with a crew member through it (Slack, Telegram): who answers, and whether its events come here. */
  readonly chat?: {
    readonly members: readonly {
      readonly id: string;
      readonly name: string;
      readonly on: boolean;
    }[];
    readonly service: ChatService;
  };
  /** For an API connector: the hosts its credential may go to without asking. */
  readonly domains?: readonly string[];
  readonly icon?: string;
  readonly id: string;
  readonly kind: Connector["kind"];
  /** Its connection name, which crew.json `connectors` uses. */
  readonly name: string;
  readonly perPerson: boolean;
  readonly serviceName: string;
  readonly title: string;
}

/** Whether a member's deployed agent has a channel. */
function hasChannel(
  setups: Readonly<Record<string, MemberSetupResult>>,
  memberId: string,
  channel: string
): boolean {
  const setup = setups[memberId];
  return setup?.ok === true && setup.setup.channels.includes(channel);
}

async function integrationOf(
  connector: Connector,
  setups: Readonly<Record<string, MemberSetupResult>>
): Promise<Integration> {
  const service = CHAT_SERVICES.find((entry) => entry === connector.service);
  const domains =
    connector.kind === "api"
      ? await approvedDomains(connector.id).catch(() => [])
      : undefined;
  return {
    id: connector.id,
    kind: connector.kind,
    name: connector.name,
    perPerson: connector.perPerson,
    serviceName: connector.serviceName,
    title: connector.title,
    ...(connector.icon ? { icon: connector.icon } : {}),
    ...(domains === undefined ? {} : { domains }),
    ...(service === undefined
      ? {}
      : {
          chat: {
            members: CREW.filter((member) =>
              hasChannel(setups, member.id, service)
            ).map((member) => ({
              id: member.id,
              name: member.name,
              on:
                connector.triggers?.paths.includes(
                  chatPath(member.id, service)
                ) ?? false,
            })),
            service,
          },
        }),
  };
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
  const active = ["linear", "notion"];
  return {
    ok: true as const,
    setups: Object.fromEntries(
      CREW.map((member) => [
        member.id,
        {
          ok: true as const,
          setup: {
            channels: [],
            connections: active.map((name) => ({ approval: true, name })),
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
      connectors: {
        list: [
          {
            id: "scl_demo_linear",
            kind: "mcp" as const,
            name: "linear",
            perPerson: true,
            serviceName: "Linear",
            title: "Linear",
          },
          {
            id: "scl_demo_notion",
            kind: "mcp" as const,
            name: "notion",
            perPerson: true,
            serviceName: "Notion",
            title: "Notion",
          },
          {
            domains: ["slack.com"],
            id: "scl_demo_slack",
            kind: "api" as const,
            name: "slack",
            perPerson: false,
            serviceName: "Slack",
            title: "Slack",
          },
        ],
        ok: true as const,
      },
      email: { lopsi: "lopsi@example.com" },
      emailSenders: 0,
      github: true,
      history: false,
      local: false,
      removable: false,
      repository: "frankievalentine/lopsi-bot-eve@main",
      version: TEMPLATE_VERSION,
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
  const update = await checkForUpdate();
  const setups = await Promise.all(
    CREW.map(
      async (member) =>
        [member.id, await memberSetup(origin, member.id)] as const
    )
  );
  const repository = targetRepository();
  const setupsById = Object.fromEntries(setups);
  const listing = await connectorListing();
  return {
    ok: true,
    setups: setupsById,
    status: {
      access: accessMode(),
      budgetUsd: sessionBudgetUsd(),
      connectors: listing.ok
        ? {
            list: await Promise.all(
              listing.connectors.map((connector) =>
                integrationOf(connector, setupsById)
              )
            ),
            ok: true,
          }
        : listing,
      email: Object.fromEntries(
        CREW.flatMap((member) => {
          const address = emailSetup(member.id)?.address;
          return address ? [[member.id, address]] : [];
        })
      ),
      emailSenders: (process.env.LOPSI_EMAIL_SENDERS ?? "")
        .split(",")
        .filter((entry) => entry.trim()).length,
      github: (await configChangesUnavailable()) === undefined,
      history: isProductionMode(),
      version: TEMPLATE_VERSION,
      ...(update === undefined ? {} : { update }),
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

/** Who may change integrations: anyone signed in, but not the demo. */
async function mayChange(): Promise<boolean> {
  return !isDemo && typeof (await currentAccount()) !== "string";
}

/** Has a Slack or Telegram connector send its messages to a crew member. */
export async function allowChat(
  connectorId: string,
  memberId: string
): Promise<{ readonly error?: string; readonly ok: boolean }> {
  if (!(await mayChange())) {
    return { error: "Sign in to change integrations.", ok: false };
  }
  if (!CREW.some((member) => member.id === memberId)) {
    return { error: "No such crew member.", ok: false };
  }
  try {
    await sendEventsTo(connectorId, memberId);
    return { ok: true };
  } catch (error) {
    console.error("[lopsi] couldn't route a connector's events:", error);
    return {
      error: "Vercel refused. Check that VERCEL_TOKEN can manage connectors.",
      ok: false,
    };
  }
}

/** Takes back a host an API connector's credential was approved for. */
export async function forgetDomain(
  connectorId: string,
  host: string
): Promise<{ readonly ok: boolean }> {
  if (!(await mayChange())) {
    return { ok: false };
  }
  await revokeDomain(connectorId, host);
  return { ok: true };
}
