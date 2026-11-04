"use client";

import {
  ArrowLeftIcon,
  ExternalLinkIcon,
  GitPullRequestIcon,
  PencilIcon,
  PlugIcon,
} from "lucide-react";
import Link from "next/link";
import { type ReactNode, useState } from "react";
import type { Account } from "@/app/_components/account";
import {
  ConnectionsDialog,
  type ConnectorSummary,
} from "@/app/_components/connections-dialog";
import { MemberConfigDialog } from "@/app/_components/member-config-dialog";
import {
  PendingChangesDialog,
  usePendingCount,
} from "@/app/_components/pending-changes-dialog";
import { Mascot } from "@/components/mascot";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import type { AccessMode } from "@/lib/access";
import type { MemberSetup, MemberSetupResult } from "@/lib/agent-info";
import type { CrewMember } from "@/lib/crew.generated";

export interface SettingsStatus {
  readonly access: AccessMode;
  readonly budgetUsd: number;
  readonly catalog: readonly {
    readonly configured: boolean;
    readonly id: string;
    readonly name: string;
    readonly variable: string;
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

const ACCESS: Record<AccessMode, string> = {
  incomplete:
    "Sign in with Vercel is set up, but the chat owner store isn't, so nobody can sign in yet. Run `pnpm setup:sign-in`.",
  open: "Local development: no sign-in.",
  password: "Starter mode: one shared password; everyone shares every chat.",
  "too-short":
    "The access password is shorter than 16 characters, so the deployment is locked.",
  unconfigured:
    "Neither mode is set up, so the deployment accepts nobody. Set LOPSI_ACCESS_PASSWORD or run `pnpm setup:sign-in`.",
  vercel:
    "Production mode: Sign in with Vercel, limited to this project's team. Each chat belongs to the person who started it.",
};

const LINKS = [
  {
    href: "https://vercel.com/d?to=%2F%5Bteam%5D%2F%7E%2Fai-gateway&title=AI+Gateway",
    label: "AI Gateway: spend, models, budgets",
  },
  {
    href: "https://vercel.com/d?to=%2F%5Bteam%5D%2F%5Bproject%5D%2Fobservability&title=Observability",
    label: "Observability: Agent Runs",
  },
  {
    href: "https://vercel.com/d?to=%2F%5Bteam%5D%2F%5Bproject%5D%2Fsettings%2Ftracing&title=Go+to+Tracing+settings",
    label: "Tracing settings: Agent Runs needs a sampling rule",
  },
  {
    href: "https://vercel.com/d?to=/%5Bteam%5D/~/connect&title=Go+to+Connect",
    label: "Vercel Connect: connectors",
  },
] as const;

function Section({
  action,
  children,
  description,
  title,
}: {
  readonly action?: ReactNode;
  readonly children: ReactNode;
  readonly description?: string;
  readonly title: string;
}) {
  return (
    <section className="space-y-3">
      <div className="flex items-end justify-between gap-3">
        <div>
          <h2 className="text-[15px] font-semibold">{title}</h2>
          {description ? (
            <p className="text-muted-foreground text-sm">{description}</p>
          ) : null}
        </div>
        {action}
      </div>
      <div className="divide-y rounded-lg border">{children}</div>
    </section>
  );
}

function Row({
  children,
  label,
}: {
  readonly children: ReactNode;
  readonly label: string;
}) {
  return (
    <div className="flex flex-col gap-1 px-4 py-3 text-sm sm:flex-row sm:gap-4">
      <span className="text-muted-foreground w-44 shrink-0">{label}</span>
      <div className="min-w-0 flex-1">{children}</div>
    </div>
  );
}

function Names({
  empty,
  items,
}: {
  readonly empty: string;
  readonly items: readonly {
    readonly approval?: boolean;
    readonly name: string;
  }[];
}) {
  if (items.length === 0) {
    return <span className="text-muted-foreground">{empty}</span>;
  }
  return (
    <span className="flex flex-wrap gap-1.5">
      {items.map((item) => (
        <Badge key={item.name} variant="secondary">
          <span className="font-mono">{item.name}</span>
          {item.approval ? " · asks first" : ""}
        </Badge>
      ))}
    </span>
  );
}

const named = (names: readonly string[]) => names.map((name) => ({ name }));

function SetupRows({ setup }: { readonly setup: MemberSetup }) {
  return (
    <>
      <Row label="Model">
        <span className="font-mono">{setup.model}</span>
        {setup.reasoning ? `, reasoning ${setup.reasoning}` : ""}
      </Row>
      <Row label="Tools">
        <Names empty="None" items={setup.tools} />
      </Row>
      <Row label="Connections">
        <Names empty="None set up" items={setup.connections} />
      </Row>
      <Row label="Skills">
        <Names empty="None" items={named(setup.skills)} />
      </Row>
      <Row label="Schedules">
        <Names empty="None" items={named(setup.schedules)} />
      </Row>
      <Row label="Subagents">
        <Names empty="None" items={named(setup.subagents)} />
      </Row>
      <Row label="Hooks">
        <Names empty="None" items={named(setup.hooks)} />
      </Row>
      <Row label="Sandbox">{setup.sandbox ?? "Default"}</Row>
      {setup.diagnostics.errors + setup.diagnostics.warnings > 0 ? (
        <Row label="Diagnostics">
          {setup.diagnostics.errors} errors, {setup.diagnostics.warnings}{" "}
          warnings. Run `eve info --agent` for details.
        </Row>
      ) : null}
    </>
  );
}

function MemberSection({
  email,
  member,
  onEdit,
  result,
}: {
  /** The member's address, when it answers email. */
  readonly email: string | undefined;
  readonly member: CrewMember;
  readonly onEdit: (() => void) | undefined;
  readonly result: MemberSetupResult | undefined;
}) {
  return (
    <Section
      action={
        onEdit ? (
          <Button onClick={onEdit} size="sm" variant="outline">
            <PencilIcon className="size-3.5" />
            Edit
          </Button>
        ) : undefined
      }
      title={member.name}
      {...(member.role ? { description: member.role } : {})}
    >
      <div className="flex items-center gap-3 px-4 py-3">
        <Mascot kind={member.mascot} size={32} />
        <Link
          className="text-sm underline-offset-4 hover:underline"
          href={`/c/${encodeURIComponent(member.id)}`}
        >
          Open chat
        </Link>
        <span className="text-muted-foreground font-mono text-xs">
          agents/{member.id}
        </span>
      </div>
      <Row label="Email">
        {email ? (
          <code className="text-xs">{email}</code>
        ) : (
          <span className="text-muted-foreground">
            Off: run <code className="text-xs">pnpm setup:email</code>
          </span>
        )}
      </Row>
      {result?.ok ? (
        <SetupRows setup={result.setup} />
      ) : (
        <Row label="Setup">
          <span className="text-muted-foreground">
            Couldn't read it: {result?.error ?? "no response"}.
          </span>
        </Row>
      )}
    </Section>
  );
}

function ConnectorsSection({
  catalog,
  onConnections,
}: {
  readonly catalog: SettingsStatus["catalog"];
  readonly onConnections: (() => void) | undefined;
}) {
  return (
    <Section
      action={
        onConnections ? (
          <Button onClick={onConnections} size="sm" variant="outline">
            <PlugIcon className="size-3.5" />
            Your connections
          </Button>
        ) : undefined
      }
      description="Services the crew can use. Set one up with the command shown; people connect their own accounts in a chat."
      title="Connectors"
    >
      {catalog.map((entry) => (
        <Row key={entry.id} label={entry.name}>
          {entry.configured ? (
            <Badge variant="secondary">Set up</Badge>
          ) : (
            <code className="text-xs">pnpm setup:connector {entry.id}</code>
          )}
        </Row>
      ))}
      <Row label="Any other">
        <code className="text-xs">
          pnpm setup:connector &lt;service or MCP URL&gt;
        </code>
      </Row>
    </Section>
  );
}

function ChangesStatus({
  onPending,
  pendingCount,
  status,
}: {
  readonly onPending: (() => void) | undefined;
  readonly pendingCount: number | null;
  readonly status: SettingsStatus;
}) {
  if (status.local) {
    return "Local development: edit the files directly.";
  }
  if (!(status.github && status.repository)) {
    return "Not set up: run `pnpm setup:connector github`.";
  }
  return (
    <span className="flex flex-wrap items-center gap-2">
      Pull requests to <code className="text-xs">{status.repository}</code>
      {onPending ? (
        <Button onClick={onPending} size="xs" variant="outline">
          <GitPullRequestIcon className="size-3" />
          Pending changes
          {pendingCount ? ` (${pendingCount})` : ""}
        </Button>
      ) : null}
    </span>
  );
}

function WorkspaceSection({
  onPending,
  pendingCount,
  status,
}: {
  readonly onPending: (() => void) | undefined;
  readonly pendingCount: number | null;
  readonly status: SettingsStatus;
}) {
  return (
    <Section title="Workspace">
      <Row label="Access">{ACCESS[status.access]}</Row>
      <Row label="Chat history">
        {status.history
          ? "Kept on the server: the list, transcripts and workspace snapshots, in the private Blob store."
          : "Kept in each browser."}
      </Row>
      <Row label="Email">
        {Object.keys(status.email).length > 0
          ? `On, from ${status.emailSenders} allowed sender ${status.emailSenders === 1 ? "entry" : "entries"} (LOPSI_EMAIL_SENDERS), when their domain passes DMARC.`
          : "Off: run `pnpm setup:email` to let the crew send and receive email."}
      </Row>
      <Row label="Budget per chat">
        {`$${status.budgetUsd.toFixed(2)}`} of model spend between Continue
        prompts (LOPSI_SESSION_BUDGET_USD).
      </Row>
      <Row label="Changes">
        <ChangesStatus
          onPending={onPending}
          pendingCount={pendingCount}
          status={status}
        />
      </Row>
      <Row label="On Vercel">
        <ul className="flex flex-col gap-1">
          {LINKS.map((link) => (
            <li key={link.href}>
              <a
                className="inline-flex items-center gap-1.5 underline-offset-4 hover:underline"
                href={link.href}
                rel="noreferrer"
                target="_blank"
              >
                {link.label}
                <ExternalLinkIcon className="size-3" />
              </a>
            </li>
          ))}
        </ul>
      </Row>
    </Section>
  );
}

/**
 * The settings page: workspace status and each crew member's effective setup.
 * Changes open the dashboard's own dialogs.
 */
export function SettingsView({
  account,
  crew,
  features,
  setups,
  status,
}: {
  readonly account: Account;
  readonly crew: readonly CrewMember[];
  readonly features: {
    readonly changes?: {
      readonly available: boolean;
      readonly reason?: string;
    };
    readonly connectors: readonly ConnectorSummary[];
  };
  readonly setups: Readonly<Record<string, MemberSetupResult>>;
  readonly status: SettingsStatus;
}) {
  const [editing, setEditing] = useState<string | null>(null);
  const [connectionsOpen, setConnectionsOpen] = useState(false);
  const [pendingOpen, setPendingOpen] = useState(false);
  const canChange = features.changes?.available === true;
  const pending = usePendingCount(canChange);
  const hasConnectors = features.connectors.length > 0;

  return (
    <main className="mx-auto w-full max-w-3xl space-y-8 px-5 py-8">
      <header className="flex items-center gap-3">
        <Button
          aria-label="Back to crew"
          nativeButton={false}
          render={<Link href="/" />}
          size="icon-sm"
          variant="ghost"
        >
          <ArrowLeftIcon className="size-4" />
        </Button>
        <h1 className="text-lg font-semibold">Settings</h1>
      </header>

      <WorkspaceSection
        onPending={canChange ? () => setPendingOpen(true) : undefined}
        pendingCount={pending.count}
        status={status}
      />
      <ConnectorsSection
        catalog={status.catalog}
        onConnections={
          hasConnectors ? () => setConnectionsOpen(true) : undefined
        }
      />
      {crew.map((member) => (
        <MemberSection
          email={status.email[member.id]}
          key={member.id}
          member={member}
          onEdit={canChange ? () => setEditing(member.id) : undefined}
          result={setups[member.id]}
        />
      ))}

      {hasConnectors ? (
        <ConnectionsDialog
          account={account}
          connectors={features.connectors}
          onOpenChange={setConnectionsOpen}
          open={connectionsOpen}
        />
      ) : null}
      {canChange ? (
        <>
          <MemberConfigDialog
            mode={{ kind: "edit", memberId: editing ?? crew[0]?.id ?? "" }}
            onOpenChange={(next) => !next && setEditing(null)}
            onPullRequest={pending.refresh}
            open={editing !== null}
          />
          <PendingChangesDialog
            onOpenChange={(next) => {
              setPendingOpen(next);
              if (!next) {
                pending.refresh();
              }
            }}
            open={pendingOpen}
          />
        </>
      ) : null}
    </main>
  );
}
