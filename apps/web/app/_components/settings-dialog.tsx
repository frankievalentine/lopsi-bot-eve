"use client";

import {
  ChevronLeftIcon,
  ChevronRightIcon,
  ExternalLinkIcon,
  GitPullRequestIcon,
  PencilIcon,
  PlugIcon,
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
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import type { AccessMode } from "@/lib/access";
import type { MemberSetup, MemberSetupResult } from "@/lib/agent-info";
import { CREW, type CrewMember } from "@/lib/crew";
import { cn } from "@/lib/utils";
import { loadSettings, type SettingsStatus } from "./settings-actions";

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

const CONNECT_LINK =
  "https://vercel.com/d?to=/%5Bteam%5D/~/connect&title=Go+to+Connect";

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
  pendingCount,
  status,
}: {
  readonly onPending: (() => void) | undefined;
  readonly pendingCount: number | null;
  readonly status: SettingsStatus;
}) {
  const access = ACCESS[status.access];
  return (
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
      <PullRequestsRow
        onPending={onPending}
        pendingCount={pendingCount}
        status={status}
      />
    </Group>
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

interface Integration {
  readonly active: boolean;
  readonly description: string;
  /** Where to set it up. */
  readonly guide: string;
  readonly id: string;
  readonly name: string;
}

function IntegrationCard({
  integration,
}: {
  readonly integration: Integration;
}) {
  const { active, description, guide, name } = integration;
  const body = (
    <>
      <span
        aria-hidden="true"
        className="bg-muted text-muted-foreground flex size-8 shrink-0 items-center justify-center rounded-md text-xs font-medium"
      >
        {name.charAt(0)}
      </span>
      <span className="min-w-0 flex-1">
        <span className="flex items-center justify-between gap-2">
          <span className="truncate text-sm font-medium">{name}</span>
          {active ? (
            <Status active={true} />
          ) : (
            <span className="text-muted-foreground shrink-0 text-xs">
              <span className="group-hover/card:hidden group-focus-visible/card:hidden">
                Off
              </span>
              <span className="text-foreground hidden items-center gap-1 group-hover/card:inline-flex group-focus-visible/card:inline-flex">
                Set Up
                <ExternalLinkIcon aria-hidden="true" className="size-3" />
              </span>
            </span>
          )}
        </span>
        <span className="text-muted-foreground mt-0.5 line-clamp-2 text-xs text-pretty">
          {description}
        </span>
      </span>
    </>
  );
  const frame = "flex items-start gap-3 rounded-lg border p-3 text-left";
  return active ? (
    <div className={frame}>{body}</div>
  ) : (
    <a
      aria-label={`Set Up ${name}`}
      className={cn(
        frame,
        "group/card hover:bg-accent focus-visible:ring-ring/50 transition-colors outline-none focus-visible:ring-3"
      )}
      href={guide}
      rel="noreferrer"
      target="_blank"
    >
      {body}
    </a>
  );
}

function IntegrationGroup({
  action,
  integrations,
  title,
}: {
  readonly action?: ReactNode;
  readonly integrations: readonly Integration[];
  readonly title: string;
}) {
  const active = integrations.filter((entry) => entry.active);
  return (
    <section className="space-y-2">
      <div className="flex min-h-7 flex-wrap items-center justify-between gap-x-3 gap-y-1">
        <h3 className="text-sm font-medium">
          {title}
          <span className="text-muted-foreground ml-2 text-xs font-normal">
            {active.length} of {integrations.length} active
          </span>
        </h3>
        {action}
      </div>
      <div className="grid gap-2 sm:grid-cols-2">
        {[...active, ...integrations.filter((entry) => !entry.active)].map(
          (entry) => (
            <IntegrationCard integration={entry} key={entry.id} />
          )
        )}
      </div>
    </section>
  );
}

function IntegrationsSection({
  onConnections,
  status,
}: {
  readonly onConnections: (() => void) | undefined;
  readonly status: SettingsStatus;
}) {
  return (
    <>
      <IntegrationGroup
        action={
          <span className="flex items-center gap-3">
            <External href={CONNECT_LINK}>Vercel Connect</External>
            {onConnections ? (
              <Button onClick={onConnections} size="xs" variant="outline">
                <PlugIcon className="size-3" />
                Your Connections
              </Button>
            ) : null}
          </span>
        }
        integrations={status.catalog.map((entry) => ({
          active: entry.configured,
          description: entry.description,
          guide: `${GUIDE}/integrations.md#connectors`,
          id: entry.id,
          name: entry.name,
        }))}
        title="Connectors"
      />
      <IntegrationGroup
        integrations={[
          {
            active: Object.keys(status.email).length > 0,
            description:
              "Email the crew, and the crew emails back through Resend.",
            guide: `${GUIDE}/integrations.md#email`,
            id: "email",
            name: "Resend",
          },
          ...status.channels.map((entry) => ({
            active: entry.configured,
            description: entry.description,
            guide: `${GUIDE}/integrations.md#channels`,
            id: entry.id,
            name: entry.name,
          })),
        ]}
        title="Channels"
      />
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
  catalog,
  setup,
}: {
  readonly catalog: SettingsStatus["catalog"];
  readonly setup: MemberSetup;
}) {
  const names = (list: readonly string[]) =>
    list.length > 0 ? list.join(", ") : "None";
  return (
    <>
      <Group title="Services">
        {setup.connections.length > 0 ? (
          setup.connections.map((connection) => (
            <Row
              key={connection.name}
              label={
                catalog.find((entry) => entry.id === connection.name)?.name ??
                connection.name
              }
            >
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
  result,
  status,
}: {
  readonly member: CrewMember;
  readonly result: MemberSetupResult | undefined;
  readonly status: SettingsStatus;
}) {
  const email = status.email[member.id];
  // A member's channel code exists whether or not it's set up, so its route
  // alone doesn't mean it's on: only the ones set up count.
  const routes = result?.ok ? result.setup.channels : [];
  const active = status.channels.filter(
    (entry) => entry.configured && routes.includes(entry.id)
  );
  return (
    <Group title="Channels">
      <Row label="Web Chat">
        <Status active={true} />
      </Row>
      <Row hint={email} label="Resend">
        <Status active={email !== undefined} />
      </Row>
      {active.map((entry) => (
        <Row key={entry.id} label={entry.name}>
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
      <MemberChannels member={member} result={result} status={status} />
      {result?.ok ? (
        <SetupGroups catalog={status.catalog} setup={result.setup} />
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

/** Loads the settings each time the dialog opens. */
function useSettings(open: boolean): Loaded | null {
  const [loaded, setLoaded] = useState<Loaded | null>(null);
  useEffect(() => {
    if (!open) {
      return;
    }
    let current = true;
    setLoaded(null);
    loadSettings()
      .then((result) => current && setLoaded(result))
      .catch(
        () =>
          current && setLoaded({ error: "Couldn't load settings.", ok: false })
      );
    return () => {
      current = false;
    };
  }, [open]);
  return loaded;
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
  readonly open: boolean;
  readonly pendingCount: number | null;
}) {
  const loaded = useSettings(open);
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
                  pendingCount={pendingCount}
                  status={loaded.status}
                />
              )}
              {panel(
                "integrations",
                <IntegrationsSection
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
