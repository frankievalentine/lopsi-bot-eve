"use server";

import {
  getToken,
  getTokenResponse,
  NoValidTokenError,
  UserAuthorizationRequiredError,
} from "@vercel/connect";
import { headers } from "next/headers";
import { type AccessMode, accessMode } from "@/lib/access";
import { type MemberSetupResult, memberSetup } from "@/lib/agent-info";
import {
  type SenderList,
  savedSenders,
  saveSenders,
  senderListsEditable,
  senderVariableEntries,
} from "@/lib/allowed-senders";
import { approvedDomains, revokeDomain } from "@/lib/connector-domains";
import {
  CHAT_SERVICES,
  type ChatService,
  type Connector,
  type ConnectorsUnavailable,
  chatPath,
  connectorListing,
  EMAIL_PATH,
  grantSubject,
  sendEventsTo,
} from "@/lib/connectors";
import { CREW } from "@/lib/crew";
import { currentAccount } from "@/lib/current-account";
import { isDemo } from "@/lib/demo";
import { DEMO_ICONS } from "@/lib/demo-icons";
import { emailDomain, emailSetup, redisStateUrl } from "@/lib/email";
import { configChangesUnavailable, targetRepository } from "@/lib/github";
import { grantHolder } from "@/lib/grant-holder";
import { isProductionMode } from "@/lib/production-mode";
import {
  BUDGET_VARIABLE,
  MAX_BUDGET_USD,
  MIN_BUDGET_USD,
  parseBudgetUsd,
  sessionBudgetUsd,
} from "@/lib/session-budget";
import {
  checkForUpdate,
  TEMPLATE_VERSION,
  type TemplateUpdate,
} from "@/lib/template-version";
import {
  deploymentTarget,
  redeploy,
  setProjectVariable,
} from "@/lib/vercel-project";

/** How this deployment is set up, as the Settings dialog shows it. */
export interface SettingsStatus {
  readonly access: AccessMode | "demo";
  /** Whether Settings can change the budget: a deployment with VERCEL_TOKEN, not local development or the demo. */
  readonly budgetEditable: boolean;
  readonly budgetUsd: number;
  /** The Vercel Connect connectors attached to this project, or why they can't be listed. */
  readonly connectors:
    | { readonly list: readonly Integration[]; readonly ok: true }
    | { readonly ok: false; readonly reason: ConnectorsUnavailable };
  /** Each member's email address, for members that answer email. */
  readonly email: Readonly<Record<string, string>>;
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
  /** Who may email the crew and message its Telegram bot, and whether Settings can change it (it needs the Blob store). */
  readonly senders: {
    readonly editable: boolean;
    readonly email: SenderListStatus;
    readonly telegram: SenderListStatus;
  };
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
  /** For a Resend connector: receiving the crew's email through it. */
  readonly email?: {
    /** The domain it's on at, or `undefined` while it's off. */
    readonly domain?: string;
    /** It sends email here, but the deployment with the domain isn't live yet. */
    readonly pending: boolean;
    /** Thread state's Redis store is connected; email needs it. */
    readonly redis: boolean;
    /** The account's domains in Resend, to pick from. */
    readonly suggestions: readonly string[];
  };
  /**
   * A per-person service the viewer hasn't signed in to yet: not a failure,
   * since the crew asks them to connect the first time it needs it.
   */
  readonly firstUse?: true;
  readonly icon?: string;
  readonly id: string;
  readonly kind: Connector["kind"];
  /** Its connection name, which crew.json `connectors` uses. */
  readonly name: string;
  readonly perPerson: boolean;
  /** Why it isn't working, when it isn't; `undefined` while it works. */
  readonly problem?: string;
  readonly serviceName: string;
  readonly title: string;
}

type Holder = Awaited<ReturnType<typeof grantHolder>>;

/** A sentinel for a per-person service the viewer hasn't connected yet. */
const FIRST_USE = Symbol("first use");

/**
 * Whether a connector works: Connect hands out its shared credential, or, for
 * one each person signs in to, the viewer's own grant ({@link FIRST_USE} when
 * they haven't signed in yet). Nobody to hold a grant (local development) only
 * needs the connector itself to be attached.
 */
async function problemOf(
  connector: Connector,
  holder: Holder
): Promise<string | typeof FIRST_USE | undefined> {
  if (connector.perPerson && holder === undefined) {
    return;
  }
  const subject = connector.perPerson
    ? grantSubject(holder as NonNullable<Holder>)
    : { type: "app" as const };
  try {
    await getTokenResponse(connector.id, { subject }, { forceRefresh: true });
  } catch (error) {
    if (
      connector.perPerson &&
      (error instanceof UserAuthorizationRequiredError ||
        error instanceof NoValidTokenError)
    ) {
      return FIRST_USE;
    }
    return connector.perPerson ? "Can't check" : "Credential failed";
  }
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
  setups: Readonly<Record<string, MemberSetupResult>>,
  holder: Holder
): Promise<Integration> {
  const problem = await problemOf(connector, holder);
  const service = CHAT_SERVICES.find((entry) => entry === connector.service);
  const domains =
    connector.kind === "api"
      ? await approvedDomains(connector.id).catch(() => [])
      : undefined;
  const email =
    connector.service === "resend" && connector.triggers
      ? await emailOf(connector)
      : undefined;
  return {
    id: connector.id,
    kind: connector.kind,
    name: connector.name,
    perPerson: connector.perPerson,
    serviceName: connector.serviceName,
    title: connector.title,
    ...(connector.icon ? { icon: connector.icon } : {}),
    ...(problem === FIRST_USE ? { firstUse: true as const } : {}),
    ...(typeof problem === "string" ? { problem } : {}),
    ...(domains === undefined ? {} : { domains }),
    ...(email === undefined ? {} : { email }),
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

/** The domains of the Resend account behind a connector, or none when it can't be asked. */
async function resendDomains(connectorId: string): Promise<string[]> {
  try {
    const key = await getToken(connectorId, { subject: { type: "app" } });
    const response = await fetch("https://api.resend.com/domains", {
      headers: { Authorization: `Bearer ${key}` },
    });
    if (!response.ok) {
      return [];
    }
    const { data = [] } = (await response.json()) as {
      data?: { name?: string }[];
    };
    return data.flatMap((entry) => (entry.name ? [entry.name] : []));
  } catch {
    return [];
  }
}

async function emailOf(connector: Connector): Promise<Integration["email"]> {
  const routed = connector.triggers?.paths.includes(EMAIL_PATH) ?? false;
  const domain = routed ? emailDomain() : undefined;
  return {
    pending: routed && domain === undefined,
    redis: redisStateUrl() !== undefined,
    suggestions: domain ? [] : await resendDomains(connector.id),
    ...(domain === undefined ? {} : { domain }),
  };
}

/** A list of who may write, as Settings edits it. */
interface SenderListStatus {
  /** Entries only an environment variable adds, which Settings can't remove. */
  readonly fixed: readonly string[];
  readonly saved: readonly string[];
}

async function senderListStatus(list: SenderList): Promise<SenderListStatus> {
  return {
    fixed: senderVariableEntries(list),
    saved: await savedSenders(list).catch(() => []),
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
      budgetEditable: false,
      budgetUsd: 1,
      connectors: {
        list: [
          {
            icon: DEMO_ICONS.linear,
            id: "scl_demo_linear",
            kind: "mcp" as const,
            name: "linear",
            perPerson: true,
            serviceName: "Linear",
            title: "Linear",
          },
          {
            firstUse: true as const,
            icon: DEMO_ICONS.notion,
            id: "scl_demo_notion",
            kind: "mcp" as const,
            name: "notion",
            perPerson: true,
            serviceName: "Notion",
            title: "Notion",
          },
          {
            domains: ["slack.com"],
            icon: DEMO_ICONS.slack,
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
      github: true,
      history: false,
      local: false,
      removable: false,
      repository: "frankievalentine/lopsi-bot-eve@main",
      senders: {
        editable: false,
        email: { fixed: [], saved: ["@example.com"] },
        telegram: { fixed: [], saved: [] },
      },
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
  const holder = await grantHolder();
  return {
    ok: true,
    setups: setupsById,
    status: {
      access: accessMode(),
      budgetEditable:
        account.kind !== "open" && Boolean(process.env.VERCEL_TOKEN?.trim()),
      budgetUsd: sessionBudgetUsd(),
      connectors: listing.ok
        ? {
            list: await Promise.all(
              listing.connectors.map((connector) =>
                integrationOf(connector, setupsById, holder)
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
      github: (await configChangesUnavailable()) === undefined,
      history: isProductionMode(),
      senders: {
        editable: senderListsEditable(),
        email: await senderListStatus("email"),
        telegram: await senderListStatus("telegram"),
      },
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
    await sendEventsTo(connectorId, { memberId });
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

const DOMAIN =
  /^(?=.{4,253}$)(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,63}$/u;

/**
 * Turns on receiving email through a Resend connector: has it send received
 * email to app/api/email, saves the domain as LOPSI_EMAIL_DOMAIN, and deploys
 * production again so the crew's channels pick it up.
 */
export async function turnOnEmail(
  connectorId: string,
  domain: string
): Promise<{ readonly error?: string; readonly ok: boolean }> {
  if (!(await mayChange())) {
    return { error: "Sign in to change integrations.", ok: false };
  }
  const name = domain.trim().toLowerCase();
  if (!DOMAIN.test(name)) {
    return { error: "Enter a domain, such as mail.example.com.", ok: false };
  }
  const target = await deploymentTarget();
  if (target === undefined) {
    return { error: "This deployment's project isn't known.", ok: false };
  }
  try {
    await sendEventsTo(connectorId, "email");
    await setProjectVariable(target, "LOPSI_EMAIL_DOMAIN", name);
    await redeploy(target);
    return { ok: true };
  } catch (error) {
    console.error("[lopsi] couldn't turn on email:", error);
    return {
      error: "Vercel refused. Check that VERCEL_TOKEN can manage the project.",
      ok: false,
    };
  }
}

/** Saves who may email the crew or message its Telegram bot. */
export async function saveAllowedSenders(
  list: SenderList,
  entries: readonly string[]
): Promise<{ readonly error?: string; readonly ok: boolean }> {
  if (!(await mayChange())) {
    return { error: "Sign in to change integrations.", ok: false };
  }
  if (!senderListsEditable()) {
    return { error: "This needs the Blob store.", ok: false };
  }
  const { error } = await saveSenders(list, entries);
  return error === undefined ? { ok: true } : { error, ok: false };
}

/**
 * Sets the spend per chat before it asks to continue: saves
 * LOPSI_SESSION_BUDGET_USD and deploys production again, since a running
 * deployment only reads its variables when it starts.
 */
export async function setSessionBudget(
  input: string
): Promise<
  | { readonly ok: true; readonly usd: number }
  | { readonly error: string; readonly ok: false }
> {
  if (!(await mayChange())) {
    return { error: "Sign in to change the budget.", ok: false };
  }
  const usd = parseBudgetUsd(input);
  if (usd === undefined) {
    return {
      error: `Enter an amount from $${MIN_BUDGET_USD.toFixed(2)} to $${MAX_BUDGET_USD.toFixed(2)}.`,
      ok: false,
    };
  }
  const target = await deploymentTarget();
  if (target === undefined) {
    return { error: "This deployment's project isn't known.", ok: false };
  }
  try {
    await setProjectVariable(target, BUDGET_VARIABLE, usd.toFixed(2));
    await redeploy(target);
    return { ok: true, usd };
  } catch (error) {
    console.error("[lopsi] couldn't set the chat budget:", error);
    return {
      error: "Vercel refused. Check that VERCEL_TOKEN can manage the project.",
      ok: false,
    };
  }
}
