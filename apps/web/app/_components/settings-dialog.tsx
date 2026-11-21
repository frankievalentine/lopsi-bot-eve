"use client";

import {
  ChevronLeftIcon,
  ChevronRightIcon,
  ExternalLinkIcon,
  GitPullRequestIcon,
  PencilIcon,
  PlugIcon,
  RefreshCwIcon,
  XIcon,
} from "lucide-react";
import Link from "next/link";
import { type ReactNode, useEffect, useRef, useState } from "react";
import { Mascot } from "@/components/mascot";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import type { AccessMode } from "@/lib/access";
import type { MemberSetup, MemberSetupResult } from "@/lib/agent-info";
import type { SenderList } from "@/lib/allowed-senders";
import type { ConnectorsUnavailable } from "@/lib/connectors";
import { CREW, type CrewMember } from "@/lib/crew";
import { cn } from "@/lib/utils";
import {
  allowChat,
  forgetDomain,
  type Integration,
  loadSettings,
  type SettingsStatus,
  saveAllowedSenders,
  turnOnEmail,
} from "./settings-actions";

const ACCESS: Record<
  AccessMode | "demo",
  { readonly hint: string; readonly label: string }
> = {
  demo: {
    hint: "Open to everyone, with prewritten replies and no model.",
    label: "Demo",
  },
  incomplete: {
    hint: "Sign-in is set up, but its chat store is missing, so nobody can sign in.",
    label: "Needs Setup",
  },
  open: { hint: "Local development has no sign-in.", label: "Open" },
  password: {
    hint: "One shared password; everyone shares every chat.",
    label: "Starter",
  },
  "too-short": {
    hint: "The password is under 16 characters, so nobody can sign in.",
    label: "Locked",
  },
  unconfigured: {
    hint: "No password or sign-in is set up, so nobody can sign in.",
    label: "Locked",
  },
  vercel: {
    hint: "Your Vercel team only; each chat belongs to whoever started it.",
    label: "Sign In With Vercel",
  },
};

const GUIDE =
  "https://github.com/frankievalentine/lopsi-bot-eve/blob/main/docs";

const USAGE_LINKS = [
  {
    hint: "Spend, models and budgets",
    href: "https://vercel.com/d?to=%2F%5Bteam%5D%2F%7E%2Fai-gateway&title=AI+Gateway",
    label: "AI Gateway",
  },
  {
    hint: "Every agent run",
    href: "https://vercel.com/d?to=%2F%5Bteam%5D%2F%5Bproject%5D%2Fobservability&title=Observability",
    label: "Observability",
  },
  {
    hint: "Agent runs need a sampling rule",
    href: "https://vercel.com/d?to=%2F%5Bteam%5D%2F%5Bproject%5D%2Fsettings%2Ftracing&title=Go+to+Tracing+settings",
    label: "Tracing",
  },
] as const;

/** This project's Connect page, where connectors are created and attached. */
const PROJECT_CONNECT_LINK =
  "https://vercel.com/d?to=%2F%5Bteam%5D%2F%5Bproject%5D%2Fconnect&title=Go+to+Connect";

const TOKENS_LINK = "https://vercel.com/account/tokens";

const ENV_LINK =
  "https://vercel.com/d?to=%2F%5Bteam%5D%2F%5Bproject%5D%2Fsettings%2Fenvironment-variables&title=Environment+Variables";

/** Crew members per page in the Crew section's picker. */
const CREW_PAGE_SIZE = 4;

const TRAILING_PERIOD = /\.$/u;

function Group({
  action,
  children,
  title,
}: {
  readonly action?: ReactNode;
  readonly children: ReactNode;
  readonly title?: string;
}) {
  return (
    <section className="space-y-2">
      {title ? (
        <div className="flex min-h-7 items-center justify-between gap-3">
          <h3 className="text-sm font-medium">{title}</h3>
          {action}
        </div>
      ) : null}
      <div className="divide-y rounded-lg border">{children}</div>
    </section>
  );
}

function Row({
  children,
  hint,
  label,
}: {
  readonly children?: ReactNode;
  readonly hint?: string | undefined;
  readonly label: ReactNode;
}) {
  return (
    <div className="flex min-h-11 flex-wrap items-center justify-between gap-x-4 gap-y-2 px-3.5 py-2.5 text-sm">
      <div className="min-w-40 flex-1">
        <div className="truncate">{label}</div>
        {hint ? (
          <p className="text-muted-foreground line-clamp-2 text-xs text-pretty">
            {hint}
          </p>
        ) : null}
      </div>
      {children === undefined ? null : (
        <div className="text-muted-foreground flex shrink-0 items-center gap-2 text-right">
          {children}
        </div>
      )}
    </div>
  );
}

function Status({ active }: { readonly active: boolean }) {
  return (
    <span className="inline-flex items-center gap-1.5 text-xs">
      <span
        aria-hidden="true"
        className={cn(
          "size-1.5 rounded-full",
          active ? "bg-online" : "bg-muted-foreground/40"
        )}
      />
      <span className={active ? "text-foreground" : undefined}>
        {active ? "Active" : "Off"}
      </span>
    </span>
  );
}

function External({
  children,
  href,
}: {
  readonly children: ReactNode;
  readonly href: string;
}) {
  return (
    <a
      className="text-foreground inline-flex items-center gap-1 text-xs underline-offset-4 hover:underline"
      href={href}
      rel="noreferrer"
      target="_blank"
    >
      {children}
      <ExternalLinkIcon aria-hidden="true" className="size-3" />
    </a>
  );
}

function GeneralSection({
  onPending,
  onRemove,
  pendingCount,
  status,
}: {
  readonly onPending: (() => void) | undefined;
  readonly onRemove: (() => void) | undefined;
  readonly pendingCount: number | null;
  readonly status: SettingsStatus;
}) {
  const access = ACCESS[status.access];
  return (
    <>
      <Group>
        <Row hint={access.hint} label="Access">
          <span className="text-foreground">{access.label}</span>
          {status.access === "vercel" ||
          status.access === "open" ||
          status.access === "demo" ? null : (
            <External href={`${GUIDE}/access.md`}>Guide</External>
          )}
        </Row>
        <Row label="Chat History">
          {status.history ? "On the Server" : "In Each Browser"}
        </Row>
        <VersionRow status={status} />
        <PullRequestsRow
          onPending={onPending}
          pendingCount={pendingCount}
          status={status}
        />
      </Group>
      {status.removable && onRemove ? (
        <Group title="Danger Zone">
          <Row
            hint="Removes it from Vercel, with what setup made for it."
            label="Remove This Project"
          >
            <Button onClick={onRemove} size="xs" variant="destructive">
              Remove
            </Button>
          </Row>
        </Group>
      ) : null}
    </>
  );
}

function VersionRow({ status }: { readonly status: SettingsStatus }) {
  const { update, version } = status;
  if (update === undefined) {
    return <Row label="Version">{`v${version}`}</Row>;
  }
  return (
    <Row
      hint={`You're on v${version}.`}
      label={
        update.security ? (
          <span className="text-destructive font-medium">
            Security Update Available: v{update.version}
          </span>
        ) : (
          `Update Available: v${update.version}`
        )
      }
    >
      <External href={update.url}>Release Notes</External>
      <External href={`${GUIDE}/updating.md`}>How to Update</External>
    </Row>
  );
}

function PullRequestsRow({
  onPending,
  pendingCount,
  status,
}: {
  readonly onPending: (() => void) | undefined;
  readonly pendingCount: number | null;
  readonly status: SettingsStatus;
}) {
  if (status.local) {
    return (
      <Row hint="Edit the files directly." label="Pull Requests">
        Local Development
      </Row>
    );
  }
  if (!(status.github && status.repository)) {
    return (
      <Row
        hint="The dashboard can't propose crew changes."
        label="Pull Requests"
      >
        <Status active={false} />
      </Row>
    );
  }
  const [slug] = status.repository.split("@");
  return (
    <Row hint={status.repository} label="Pull Requests">
      {onPending ? (
        <Button onClick={onPending} size="xs" variant="outline">
          <GitPullRequestIcon className="size-3" />
          Pending Changes
          {pendingCount ? ` (${pendingCount})` : ""}
        </Button>
      ) : null}
      <External href={`https://github.com/${slug}`}>Repository</External>
    </Row>
  );
}

/** What the status card says when Lopsi can't list connectors, and whether a new token fixes it. */
const UNAVAILABLE: Record<
  ConnectorsUnavailable,
  { readonly hint: string; readonly token: boolean }
> = {
  "no-project": {
    hint: "Run `vercel link` and `vercel env pull` to connect locally.",
    token: false,
  },
  "no-token": {
    hint: "Create a Vercel token to see your connectors.",
    token: true,
  },
  refused: {
    hint: "The token expired or can't reach this team. Create a new one.",
    token: true,
  },
};

function LinkButton({
  children,
  href,
  variant = "outline",
}: {
  readonly children: ReactNode;
  readonly href: string;
  readonly variant?: "default" | "outline";
}) {
  return (
    <Button
      nativeButton={false}
      render={<a href={href} rel="noreferrer" target="_blank" />}
      size="xs"
      variant={variant}
    >
      {children}
      <ExternalLinkIcon aria-hidden="true" className="size-3" />
    </Button>
  );
}

/** Why Lopsi can't see the project's connectors, and how to fix it. */
function ConnectProblem({
  reason,
}: {
  readonly reason: ConnectorsUnavailable;
}) {
  const problem = UNAVAILABLE[reason];
  return (
    <div className="flex flex-wrap items-center gap-x-4 gap-y-2 rounded-lg border px-3.5 py-3">
      <span
        aria-hidden="true"
        className="bg-destructive size-2 shrink-0 rounded-full"
      />
      <div className="min-w-40 flex-1">
        <p className="text-sm font-medium">Not Connected</p>
        <p className="text-muted-foreground text-xs text-pretty">
          {problem.hint}
        </p>
      </div>
      {problem.token ? (
        <div className="flex shrink-0 gap-2">
          <LinkButton href={TOKENS_LINK} variant="default">
            Create Token
          </LinkButton>
          <LinkButton href={ENV_LINK}>Set Token</LinkButton>
        </div>
      ) : null}
    </div>
  );
}

function ServiceIcon({ integration }: { readonly integration: Integration }) {
  return integration.icon ? (
    <span className="bg-muted flex size-8 shrink-0 items-center justify-center rounded-md">
      {/* biome-ignore lint/performance/noImgElement: Vercel Connect's own icon, as a data URI. */}
      <img
        alt=""
        className="size-4.5"
        height={18}
        src={integration.icon}
        width={18}
      />
    </span>
  ) : (
    <span
      aria-hidden="true"
      className="bg-muted text-muted-foreground flex size-8 shrink-0 items-center justify-center rounded-md text-xs font-medium"
    >
      {integration.serviceName.charAt(0)}
    </span>
  );
}

const CHAT_NAMES = { slack: "Slack", telegram: "Telegram" } as const;

function ChatRows({
  integration,
  onChanged,
  senders,
}: {
  readonly integration: Integration;
  readonly onChanged: () => void;
  readonly senders: SettingsStatus["senders"];
}) {
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const { chat } = integration;
  if (chat === undefined || chat.members.length === 0) {
    return null;
  }
  const turnOn = (memberId: string) => {
    setBusy(memberId);
    setError(null);
    allowChat(integration.id, memberId)
      .then((result) => {
        if (result.ok) {
          onChanged();
        } else {
          setError(result.error ?? "Couldn't turn it on.");
        }
      })
      .catch(() => setError("Couldn't turn it on."))
      .finally(() => setBusy(null));
  };
  return (
    <div className="space-y-1.5 border-t pt-2">
      {chat.members.map((member) => (
        <div
          className="flex items-center justify-between gap-2 text-xs"
          key={member.id}
        >
          <span className="text-muted-foreground">
            Chat with {member.name} in {CHAT_NAMES[chat.service]}
          </span>
          {member.on ? (
            <Status active={true} />
          ) : (
            <Button
              disabled={busy !== null}
              onClick={() => turnOn(member.id)}
              size="xs"
              variant="outline"
            >
              {busy === member.id ? "Turning On…" : "Turn On"}
            </Button>
          )}
        </div>
      ))}
      {chat.service === "telegram" ? (
        <SendersEditor
          list="telegram"
          onChanged={onChanged}
          senders={senders}
        />
      ) : null}
      {error ? (
        <p className="text-destructive text-xs" role="alert">
          {error}
        </p>
      ) : null}
    </div>
  );
}

function DomainRows({
  integration,
  onChanged,
}: {
  readonly integration: Integration;
  readonly onChanged: () => void;
}) {
  const [busy, setBusy] = useState<string | null>(null);
  const { domains } = integration;
  if (domains === undefined) {
    return null;
  }
  const forget = (host: string) => {
    setBusy(host);
    forgetDomain(integration.id, host)
      .then(onChanged)
      .catch(() => undefined)
      .finally(() => setBusy(null));
  };
  return (
    <div className="space-y-1.5 border-t pt-2 text-xs">
      {domains.length === 0 ? (
        <p className="text-muted-foreground text-pretty">
          The crew asks before its credential goes to any host.
        </p>
      ) : (
        <>
          <p className="text-muted-foreground">Approved hosts</p>
          <ul className="flex flex-wrap gap-1.5">
            {domains.map((host) => (
              <li
                className="bg-muted inline-flex items-center gap-1 rounded-md py-0.5 pr-0.5 pl-2 font-mono"
                key={host}
              >
                {host}
                <Button
                  aria-label={`Ask Again Before Using ${host}`}
                  disabled={busy !== null}
                  onClick={() => forget(host)}
                  size="icon-xs"
                  variant="ghost"
                >
                  <XIcon className="size-3" />
                </Button>
              </li>
            ))}
          </ul>
        </>
      )}
    </div>
  );
}

const SENDER_LISTS = {
  email: {
    empty: "Nobody yet: email from anyone is dropped.",
    label: "Who may email the crew",
    placeholder: "ana@example.com or @example.com",
  },
  telegram: {
    empty: "Nobody yet: messages from anyone are dropped.",
    label: "Who may message the bot",
    placeholder: "Username or user id",
  },
} as const;

/** Who may write to the crew from outside the dashboard, edited in place. */
function SendersEditor({
  list,
  onChanged,
  senders,
}: {
  readonly list: SenderList;
  readonly onChanged: () => void;
  readonly senders: SettingsStatus["senders"];
}) {
  const [draft, setDraft] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const { fixed, saved } = senders[list];
  const copy = SENDER_LISTS[list];
  const save = (entries: readonly string[], after?: () => void) => {
    setBusy(true);
    setError(null);
    saveAllowedSenders(list, entries)
      .then((result) => {
        if (result.ok) {
          after?.();
          onChanged();
        } else {
          setError(result.error ?? "Couldn't save.");
        }
      })
      .catch(() => setError("Couldn't save."))
      .finally(() => setBusy(false));
  };
  const add = () => {
    const entries = draft
      .split(",")
      .map((entry) => entry.trim())
      .filter(Boolean);
    if (entries.length > 0) {
      save([...saved, ...entries], () => setDraft(""));
    }
  };
  const all = [...saved, ...fixed.filter((entry) => !saved.includes(entry))];
  return (
    <div className="space-y-1.5 text-xs">
      <p className="text-muted-foreground">{copy.label}</p>
      {all.length === 0 ? (
        <p className="text-muted-foreground text-pretty">{copy.empty}</p>
      ) : (
        <ul className="flex flex-wrap gap-1.5">
          {all.map((entry) => (
            <li
              className="bg-muted inline-flex items-center gap-1 rounded-md py-0.5 pr-0.5 pl-2 font-mono"
              key={entry}
            >
              {entry}
              {saved.includes(entry) && senders.editable ? (
                <Button
                  aria-label={`Remove ${entry}`}
                  disabled={busy}
                  onClick={() =>
                    save(saved.filter((existing) => existing !== entry))
                  }
                  size="icon-xs"
                  variant="ghost"
                >
                  <XIcon className="size-3" />
                </Button>
              ) : null}
              {saved.includes(entry) ? null : (
                <span className="text-muted-foreground px-1">env</span>
              )}
            </li>
          ))}
        </ul>
      )}
      {senders.editable ? (
        <form
          className="flex gap-1.5"
          onSubmit={(event) => {
            event.preventDefault();
            add();
          }}
        >
          <Input
            aria-label={copy.label}
            className="h-7 text-xs"
            disabled={busy}
            onChange={(event) => setDraft(event.target.value)}
            placeholder={copy.placeholder}
            value={draft}
          />
          <Button disabled={busy || !draft.trim()} size="xs" type="submit">
            Add
          </Button>
        </form>
      ) : (
        <p className="text-muted-foreground text-pretty">
          Editing this needs the project's Blob store.
        </p>
      )}
      {error ? (
        <p className="text-destructive" role="alert">
          {error}
        </p>
      ) : null}
    </div>
  );
}

const UPSTASH_LINK = "https://vercel.com/marketplace/upstash";

/** Receiving the crew's email through a Resend connector. */
function EmailRows({
  integration,
  onChanged,
  status,
}: {
  readonly integration: Integration;
  readonly onChanged: () => void;
  readonly status: SettingsStatus;
}) {
  const [domain, setDomain] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const { email } = integration;
  if (email === undefined) {
    return null;
  }
  const turnOn = () => {
    setBusy(true);
    setError(null);
    turnOnEmail(integration.id, domain || (email.suggestions[0] ?? ""))
      .then((result) => {
        if (result.ok) {
          onChanged();
        } else {
          setError(result.error ?? "Couldn't turn it on.");
        }
      })
      .catch(() => setError("Couldn't turn it on."))
      .finally(() => setBusy(false));
  };
  const addresses = Object.values(status.email);
  let body: ReactNode;
  if (!email.redis) {
    body = (
      <div className="flex items-center justify-between gap-2">
        <span className="text-muted-foreground text-pretty">
          Receiving email needs Upstash for Redis, for its threads.
        </span>
        <LinkButton href={UPSTASH_LINK}>Add Upstash</LinkButton>
      </div>
    );
  } else if (email.domain) {
    body = (
      <>
        <div className="flex items-center justify-between gap-2">
          <span className="text-muted-foreground">Receives email</span>
          <Status active={true} />
        </div>
        {addresses.length > 0 ? (
          <p className="font-mono text-pretty">{addresses.join(", ")}</p>
        ) : null}
      </>
    );
  } else if (email.pending) {
    body = (
      <div className="flex items-center justify-between gap-2">
        <span className="text-muted-foreground text-pretty">
          Turning on: production is redeploying. Refresh in a few minutes.
        </span>
      </div>
    );
  } else {
    body = (
      <form
        className="space-y-1.5"
        onSubmit={(event) => {
          event.preventDefault();
          turnOn();
        }}
      >
        <span className="text-muted-foreground block text-pretty">
          Let people email the crew at {"<member>@"}your domain. Turn on
          receiving for the domain in Resend first.
        </span>
        <div className="flex gap-1.5">
          <Input
            aria-label="Domain to receive email at"
            className="h-7 text-xs"
            disabled={busy}
            list={`domains-${integration.id}`}
            onChange={(event) => setDomain(event.target.value)}
            placeholder={email.suggestions[0] ?? "mail.example.com"}
            value={domain}
          />
          <datalist id={`domains-${integration.id}`}>
            {email.suggestions.map((name) => (
              <option key={name} value={name} />
            ))}
          </datalist>
          <Button
            disabled={busy || !(domain || email.suggestions[0])}
            size="xs"
            type="submit"
          >
            {busy ? "Turning On…" : "Turn On"}
          </Button>
        </div>
      </form>
    );
  }
  return (
    <div className="space-y-2 border-t pt-2 text-xs">
      {body}
      {email.domain || email.pending ? (
        <SendersEditor
          list="email"
          onChanged={onChanged}
          senders={status.senders}
        />
      ) : null}
      {error ? (
        <p className="text-destructive" role="alert">
          {error}
        </p>
      ) : null}
    </div>
  );
}

function IntegrationCard({
  integration,
  onChanged,
  status,
}: {
  readonly integration: Integration;
  readonly onChanged: () => void;
  readonly status: SettingsStatus;
}) {
  const { kind, problem, serviceName, title } = integration;
  return (
    <div className="space-y-2 rounded-lg border p-3">
      <div className="flex items-start gap-3">
        <ServiceIcon integration={integration} />
        <span className="min-w-0 flex-1">
          <span className="flex items-center gap-2">
            <span
              aria-label={problem ? "Not working" : "Working"}
              className={cn(
                "size-1.5 shrink-0 rounded-full",
                problem ? "bg-destructive" : "bg-online"
              )}
              role="img"
            />
            <span className="truncate text-sm font-medium">{title}</span>
          </span>
          <span className="text-muted-foreground mt-0.5 block text-xs">
            {title === serviceName ? "" : `${serviceName} · `}
            {kind === "mcp" ? "MCP" : "API"}
          </span>
          {problem ? (
            <span className="text-destructive mt-1 block text-xs text-pretty">
              {problem}
            </span>
          ) : null}
        </span>
      </div>
      <ChatRows
        integration={integration}
        onChanged={onChanged}
        senders={status.senders}
      />
      <EmailRows
        integration={integration}
        onChanged={onChanged}
        status={status}
      />
      <DomainRows integration={integration} onChanged={onChanged} />
    </div>
  );
}

function IntegrationsSection({
  onChanged,
  onConnections,
  status,
}: {
  readonly onChanged: () => void;
  readonly onConnections: (() => void) | undefined;
  readonly status: SettingsStatus;
}) {
  const { connectors } = status;
  return (
    <>
      <section className="space-y-2">
        <div className="flex min-h-7 flex-wrap items-center justify-between gap-x-3 gap-y-1">
          <h3 className="text-sm font-medium">Connected Services</h3>
          <span className="flex items-center gap-2">
            {onConnections ? (
              <Button onClick={onConnections} size="xs" variant="outline">
                <PlugIcon className="size-3" />
                Your Connections
              </Button>
            ) : null}
            <Button onClick={onChanged} size="xs" variant="ghost">
              <RefreshCwIcon className="size-3" />
              Refresh
            </Button>
            <LinkButton href={PROJECT_CONNECT_LINK} variant="default">
              Add Connectors
            </LinkButton>
          </span>
        </div>
        {connectors.ok ? null : <ConnectProblem reason={connectors.reason} />}
        {connectors.ok && connectors.list.length === 0 ? (
          <Group>
            <Row
              hint="Add any service from Vercel Connect (Slack, Google, Stripe, Linear, …) and attach it to this project. It shows up here within a minute; refresh to check."
              label="Nothing connected yet"
            />
          </Group>
        ) : null}
        {connectors.ok && connectors.list.length > 0 ? (
          <div className="grid gap-2 sm:grid-cols-2">
            {connectors.list.map((integration) => (
              <IntegrationCard
                integration={integration}
                key={integration.id}
                onChanged={onChanged}
                status={status}
              />
            ))}
          </div>
        ) : null}
      </section>
      {connectors.ok &&
      !connectors.list.some((integration) => integration.email) ? (
        <Group title="Email">
          <Row
            hint="Add a Resend connector in Vercel (an API key with full access), then turn on email on its card."
            label="Let people email the crew"
          >
            <External href={`${GUIDE}/integrations.md#email`}>Guide</External>
          </Row>
        </Group>
      ) : null}
    </>
  );
}

function UsageSection({ status }: { readonly status: SettingsStatus }) {
  return (
    <>
      <Group>
        <Row
          hint="Model spend before a chat asks whether to continue."
          label="Budget per Chat"
        >
          <span className="text-foreground tabular-nums">
            {`$${status.budgetUsd.toFixed(2)}`}
          </span>
        </Row>
      </Group>
      <Group title="On Vercel">
        {USAGE_LINKS.map((link) => (
          <Row hint={link.hint} key={link.href} label={link.label}>
            <External href={link.href}>Open</External>
          </Row>
        ))}
      </Group>
    </>
  );
}

/** A member's setup that Edit doesn't cover, from its deployed agent. */
function SetupGroups({
  connectors,
  setup,
}: {
  readonly connectors: SettingsStatus["connectors"];
  readonly setup: MemberSetup;
}) {
  const titleOf = (name: string) =>
    (connectors.ok
      ? connectors.list.find((entry) => entry.name === name)?.title
      : undefined) ?? name;
  const names = (list: readonly string[]) =>
    list.length > 0 ? list.join(", ") : "None";
  return (
    <>
      <Group title="Services">
        {setup.connections.length > 0 ? (
          setup.connections.map((connection) => (
            <Row key={connection.name} label={titleOf(connection.name)}>
              <span className="text-xs">
                {connection.approval ? "Asks First" : "Runs Directly"}
              </span>
            </Row>
          ))
        ) : (
          <Row label="None set up" />
        )}
      </Group>
      <Group title="Capabilities">
        <Row label="Skills">{names(setup.skills)}</Row>
        <Row label="Schedules">{names(setup.schedules)}</Row>
        <Row label="Subagents">{names(setup.subagents)}</Row>
        <Row label="Sandbox">{setup.sandbox ?? "Default"}</Row>
        {setup.diagnostics.errors + setup.diagnostics.warnings > 0 ? (
          <Row hint="Run `eve info --agent` for details." label="Diagnostics">
            {setup.diagnostics.errors} errors, {setup.diagnostics.warnings}{" "}
            warnings
          </Row>
        ) : null}
      </Group>
    </>
  );
}

function MemberChannels({
  member,
  status,
}: {
  readonly member: CrewMember;
  readonly status: SettingsStatus;
}) {
  const email = status.email[member.id];
  const chats = status.connectors.ok
    ? status.connectors.list.flatMap((integration) =>
        integration.chat?.members.some(
          (entry) => entry.id === member.id && entry.on
        )
          ? [integration]
          : []
      )
    : [];
  return (
    <Group title="Channels">
      <Row label="Web Chat">
        <Status active={true} />
      </Row>
      <Row hint={email} label="Resend">
        <Status active={email !== undefined} />
      </Row>
      {chats.map((integration) => (
        <Row
          hint={integration.title}
          key={integration.id}
          label={integration.serviceName}
        >
          <Status active={true} />
        </Row>
      ))}
    </Group>
  );
}

function MemberDetail({
  member,
  onEdit,
  onOpenChat,
  result,
  status,
}: {
  readonly member: CrewMember;
  readonly onEdit: (() => void) | undefined;
  /** Closes Settings as the member's chat opens. */
  readonly onOpenChat: () => void;
  readonly result: MemberSetupResult | undefined;
  readonly status: SettingsStatus;
}) {
  return (
    <>
      <div className="flex items-center gap-3">
        <Mascot kind={member.mascot} size={40} />
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-medium">{member.name}</p>
          {member.role ? (
            <p className="text-muted-foreground truncate text-xs">
              {member.role}
            </p>
          ) : null}
        </div>
        <Button
          nativeButton={false}
          render={
            <Link
              href={`/c/${encodeURIComponent(member.id)}`}
              onClick={onOpenChat}
            />
          }
          size="sm"
          variant="ghost"
        >
          Open Chat
        </Button>
        {onEdit ? (
          <Button onClick={onEdit} size="sm" variant="outline">
            <PencilIcon className="size-3.5" />
            Edit Profile
          </Button>
        ) : null}
      </div>
      <MemberChannels member={member} status={status} />
      {result?.ok ? (
        <SetupGroups connectors={status.connectors} setup={result.setup} />
      ) : (
        <Group>
          <Row
            hint={`${(result?.error ?? "No response").replace(TRAILING_PERIOD, "")}.`}
            label="Couldn't read this member's setup"
          />
        </Group>
      )}
    </>
  );
}

/**
 * Chooses a crew member: a page of names at a time, with numbered pages once
 * there are more than fit. A one-member crew shows no picker.
 */
function CrewPicker({
  onSelect,
  selected,
}: {
  readonly onSelect: (member: CrewMember) => void;
  readonly selected: CrewMember;
}) {
  const pages = Math.ceil(CREW.length / CREW_PAGE_SIZE);
  const [page, setPage] = useState(
    Math.floor(CREW.indexOf(selected) / CREW_PAGE_SIZE)
  );
  if (CREW.length < 2) {
    return null;
  }
  const start = page * CREW_PAGE_SIZE;
  const turnTo = (next: number) => setPage(next);
  return (
    <nav aria-label="Crew Members" className="space-y-2">
      <div className="grid grid-cols-2 gap-1.5 sm:grid-cols-4">
        {CREW.slice(start, start + CREW_PAGE_SIZE).map((member) => (
          <button
            aria-current={member.id === selected.id ? "true" : undefined}
            className={cn(
              "hover:bg-accent focus-visible:ring-ring/50 flex min-w-0 items-center gap-2 rounded-lg border px-2 py-1.5 text-left text-sm transition-colors outline-none focus-visible:ring-3",
              member.id === selected.id
                ? "bg-accent border-foreground/20"
                : "border-transparent"
            )}
            key={member.id}
            onClick={() => onSelect(member)}
            type="button"
          >
            <Mascot kind={member.mascot} label="" size={20} />
            <span className="truncate">{member.name}</span>
          </button>
        ))}
      </div>
      {pages > 1 ? (
        <div className="flex items-center justify-end gap-1">
          <Button
            aria-label="Previous Page"
            disabled={page === 0}
            onClick={() => turnTo(page - 1)}
            size="icon-xs"
            variant="ghost"
          >
            <ChevronLeftIcon className="size-3.5" />
          </Button>
          {Array.from({ length: pages }, (_, index) => index).map((index) => (
            <Button
              aria-current={index === page ? "page" : undefined}
              aria-label={`Page ${index + 1}`}
              key={index}
              onClick={() => turnTo(index)}
              size="icon-xs"
              variant={index === page ? "secondary" : "ghost"}
            >
              {index + 1}
            </Button>
          ))}
          <Button
            aria-label="Next Page"
            disabled={page === pages - 1}
            onClick={() => turnTo(page + 1)}
            size="icon-xs"
            variant="ghost"
          >
            <ChevronRightIcon className="size-3.5" />
          </Button>
        </div>
      ) : null}
    </nav>
  );
}

function CrewSection({
  onEdit,
  onOpenChat,
  setups,
  status,
}: {
  readonly onEdit: ((member: CrewMember) => void) | undefined;
  readonly onOpenChat: () => void;
  readonly setups: Readonly<Record<string, MemberSetupResult>>;
  readonly status: SettingsStatus;
}) {
  const [selected, setSelected] = useState(CREW[0]);
  if (selected === undefined) {
    return <p className="text-muted-foreground text-sm">No crew yet.</p>;
  }
  return (
    <>
      <CrewPicker onSelect={setSelected} selected={selected} />
      <MemberDetail
        member={selected}
        onEdit={onEdit ? () => onEdit(selected) : undefined}
        onOpenChat={onOpenChat}
        result={setups[selected.id]}
        status={status}
      />
    </>
  );
}

type Loaded = Awaited<ReturnType<typeof loadSettings>>;

/** Loads the settings each time the dialog opens, and again on `reload`. */
function useSettings(open: boolean): [Loaded | null, () => void] {
  const [loaded, setLoaded] = useState<Loaded | null>(null);
  const [version, setVersion] = useState(0);
  useEffect(() => {
    if (!open) {
      return;
    }
    let current = true;
    // A reload keeps what's shown until the new settings arrive.
    if (version === 0) {
      setLoaded(null);
    }
    loadSettings()
      .then((result) => current && setLoaded(result))
      .catch(
        () =>
          current && setLoaded({ error: "Couldn't load settings.", ok: false })
      );
    return () => {
      current = false;
    };
  }, [open, version]);
  useEffect(() => {
    if (!open) {
      setVersion(0);
    }
  }, [open]);
  return [loaded, () => setVersion((count) => count + 1)];
}

const SECTIONS = [
  { id: "general", label: "General" },
  { id: "integrations", label: "Integrations" },
  { id: "crew", label: "Crew" },
  { id: "usage", label: "Usage" },
] as const;

/**
 * Settings: how this deployment is set up, and what each crew member has beyond
 * its Edit form. Changes open the dashboard's own dialogs, through these
 * callbacks; Settings closes first.
 */
export function SettingsDialog({
  onConnections,
  onEdit,
  onOpenChange,
  onPendingChanges,
  onRemove,
  open,
  pendingCount,
}: {
  /** Opens Connections; absent when no connector is set up. */
  readonly onConnections?: (() => void) | undefined;
  /** Opens a member's Edit; absent where changes aren't possible. */
  readonly onEdit?: ((memberId: string) => void) | undefined;
  readonly onOpenChange: (open: boolean) => void;
  /** Opens Pending Changes; absent where changes aren't possible. */
  readonly onPendingChanges?: (() => void) | undefined;
  /** Opens Remove This Project. */
  readonly onRemove?: (() => void) | undefined;
  readonly open: boolean;
  readonly pendingCount: number | null;
}) {
  const [loaded, reload] = useSettings(open);
  // Focus the dialog, not its first section: a ring there reads as a selection.
  const popup = useRef<HTMLDivElement>(null);
  const then = (action: (() => void) | undefined) =>
    action
      ? () => {
          onOpenChange(false);
          action();
        }
      : undefined;

  const panel = (id: string, content: ReactNode) => (
    <TabsContent
      className="min-h-0 flex-1 space-y-5 overflow-y-auto overscroll-contain p-5 sm:pt-12"
      key={id}
      value={id}
    >
      {content}
    </TabsContent>
  );

  return (
    <Dialog onOpenChange={onOpenChange} open={open}>
      <DialogContent
        className="flex h-[min(85svh,640px)] flex-col gap-0 overflow-hidden p-0 sm:max-w-3xl"
        initialFocus={popup}
        ref={popup}
      >
        <Tabs
          className="min-h-0 flex-1 flex-col gap-0 sm:flex-row"
          defaultValue="general"
          orientation="vertical"
        >
          <div className="bg-sidebar shrink-0 border-b p-3 sm:w-44 sm:border-r sm:border-b-0">
            <DialogTitle className="px-2 pb-2 text-[15px] sm:pt-1 sm:pb-3">
              Settings
            </DialogTitle>
            <DialogDescription className="sr-only">
              How this deployment and its crew are set up.
            </DialogDescription>
            <TabsList className="h-auto! w-full flex-row! justify-start gap-0.5 overflow-x-auto rounded-none bg-transparent p-0 sm:flex-col! sm:items-stretch sm:overflow-visible">
              {SECTIONS.map((section) => (
                <TabsTrigger
                  className="data-active:bg-sidebar-accent dark:data-active:bg-sidebar-accent h-8 w-auto! flex-none justify-start rounded-md px-2.5 sm:w-full!"
                  key={section.id}
                  value={section.id}
                >
                  {section.label}
                </TabsTrigger>
              ))}
            </TabsList>
          </div>
          {loaded?.ok ? (
            <>
              {panel(
                "general",
                <GeneralSection
                  onPending={then(onPendingChanges)}
                  onRemove={then(onRemove)}
                  pendingCount={pendingCount}
                  status={loaded.status}
                />
              )}
              {panel(
                "integrations",
                <IntegrationsSection
                  onChanged={reload}
                  onConnections={then(onConnections)}
                  status={loaded.status}
                />
              )}
              {panel(
                "crew",
                <CrewSection
                  onEdit={
                    onEdit
                      ? (member) => then(() => onEdit(member.id))?.()
                      : undefined
                  }
                  onOpenChat={() => onOpenChange(false)}
                  setups={loaded.setups}
                  status={loaded.status}
                />
              )}
              {panel("usage", <UsageSection status={loaded.status} />)}
            </>
          ) : (
            <div className="min-w-0 flex-1 p-5 sm:pt-12">
              {loaded === null ? (
                <p className="text-muted-foreground text-sm">Loading…</p>
              ) : (
                <p className="text-destructive text-sm" role="alert">
                  {loaded.error}
                </p>
              )}
            </div>
          )}
        </Tabs>
      </DialogContent>
    </Dialog>
  );
}
