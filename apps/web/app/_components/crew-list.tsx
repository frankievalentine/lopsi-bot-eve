"use client";

import {
  GitPullRequestIcon,
  LogOutIcon,
  PlugIcon,
  PlusIcon,
  SearchIcon,
  SettingsIcon,
  SquarePenIcon,
  XIcon,
} from "lucide-react";
import Link from "next/link";
import { useState } from "react";
import { LMark } from "@/components/l-mark";
import { Mascot, type MascotMood } from "@/components/mascot";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { type ChatHistory, memberHref } from "@/lib/chat-history";
import type { CrewMember } from "@/lib/crew.generated";
import { cn } from "@/lib/utils";
import { formatWhen } from "@/lib/when";
import type { Account } from "./account";

/** Ported from lopsi-bot's crew-sidebar.tsx and mobile-crew-list.tsx. */

export interface CrewListProps {
  readonly account: Account;
  /**
   * Configuration by pull request; absent in local development. When
   * `available` is false the buttons stay, disabled, with `reason` as a hint.
   */
  readonly changes?: ChangeActions;
  readonly crew: readonly CrewMember[];
  readonly history: ChatHistory;
  readonly moodOf: (member: CrewMember) => MascotMood;
  /** Opens the Connections dialog; absent when no connector is set up. */
  readonly onConnections?: () => void;
  /** Opens the Settings dialog. */
  readonly onSettings: () => void;
  /** Absent in local development, where nobody signs in. */
  readonly onSignOut?: () => void;
  readonly selectedId?: string;
}

interface ChangeActions {
  readonly available: boolean;
  readonly onNewMember: () => void;
  readonly onPendingChanges: () => void;
  /** Open pull requests from the dashboard; 0 when none or unknown. */
  readonly pendingCount: number;
  readonly reason?: string;
}

function PendingBadge({ count }: { readonly count: number }) {
  return count ? (
    <Badge
      aria-label={`${count} open pull request${count === 1 ? "" : "s"}`}
      className="ml-auto"
      variant="secondary"
    >
      {count}
    </Badge>
  ) : null;
}

/** The person in the list's footer or header. */
function personOf(account: Account): {
  detail: string;
  initials: string;
  name: string;
} {
  switch (account.kind) {
    case "vercel":
      return {
        detail: account.email,
        initials: initialsOf(account.name, account.email),
        name: account.name,
      };
    case "password":
      return {
        detail: "Shared password",
        initials: "LB",
        name: "Crew operator",
      };
    default:
      return { detail: "Local development", initials: "LB", name: "You" };
  }
}

const WHITESPACE = /\s+/u;

function initialsOf(name: string, email: string): string {
  const words = name.trim().split(WHITESPACE).filter(Boolean);
  const [first, ...rest] = words;
  const last = rest.at(-1);
  const letters =
    first !== undefined && last !== undefined
      ? `${first.charAt(0)}${last.charAt(0)}`
      : (first ?? email).slice(0, 2);
  return letters.toUpperCase();
}

function matches(member: CrewMember, query: string): boolean {
  return `${member.name} ${member.role}`
    .toLowerCase()
    .includes(query.trim().toLowerCase());
}

function previewOf(member: CrewMember, history: ChatHistory): string {
  return history[member.id]?.preview ?? member.role ?? "No messages yet";
}

function timeOf(member: CrewMember, history: ChatHistory): string {
  const at = history[member.id]?.updatedAt;
  return at === undefined ? "" : formatWhen(at);
}

/** Wide screens: the crew beside the open chat. */
export function CrewSidebar({
  account,
  changes,
  crew,
  history,
  moodOf,
  onConnections,
  onSettings,
  onSignOut,
  selectedId,
}: CrewListProps) {
  const [query, setQuery] = useState("");
  const visible = crew.filter((member) => matches(member, query));
  const person = personOf(account);

  return (
    <aside className="border-sidebar-border bg-sidebar text-sidebar-foreground flex max-h-[max(100svh,640px)] min-w-0 flex-[1_1_320px] flex-col border-r">
      <div className="flex items-center gap-2.5 pt-3.5 pr-3 pb-2.5 pl-4">
        <LMark label="" size={28} />
        <span className="text-[15px] font-semibold tracking-tight">
          Lopsi Bot
        </span>
        <span className="flex-1" />
        {changes ? (
          <Button
            aria-label="New Crew Member"
            disabled={!changes.available}
            onClick={changes.onNewMember}
            size="icon-sm"
            title={changes.available ? "New Crew Member" : changes.reason}
            variant="ghost"
          >
            <SquarePenIcon className="size-4" />
          </Button>
        ) : null}
      </div>

      <div className="px-3 pb-2">
        <label className="bg-background focus-within:ring-ring/50 flex h-8 items-center gap-2 rounded-md border px-2.5 shadow-xs focus-within:ring-3">
          <SearchIcon className="text-muted-foreground size-4" />
          <input
            aria-label="Search crew"
            className="placeholder:text-muted-foreground w-full bg-transparent text-[13px] outline-none"
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search crew…"
            value={query}
          />
        </label>
      </div>

      <div className="text-muted-foreground px-5 pt-2.5 pb-1 text-xs font-medium">
        Crew
      </div>
      <nav
        aria-label="Crew"
        className="flex flex-1 flex-col gap-0.5 overflow-y-auto px-2"
      >
        {visible.map((member) => {
          const active = member.id === selectedId;
          return (
            <Link
              aria-current={active ? "page" : undefined}
              className={cn(
                "hover:bg-sidebar-accent flex w-full items-center gap-3 rounded-lg p-2 text-left transition-colors",
                active && "bg-sidebar-accent"
              )}
              href={memberHref(member.id, history)}
              key={member.id}
            >
              <Mascot kind={member.mascot} mood={moodOf(member)} size={40} />
              <span className="flex min-w-0 flex-1 flex-col gap-px">
                <span className="flex items-baseline gap-2">
                  <span className="flex-1 text-sm font-medium">
                    {member.name}
                  </span>
                  <span className="text-muted-foreground text-xs">
                    {timeOf(member, history)}
                  </span>
                </span>
                <span className="text-muted-foreground truncate text-[13px]">
                  {previewOf(member, history)}
                </span>
              </span>
            </Link>
          );
        })}
        {visible.length === 0 ? (
          <p className="text-muted-foreground px-3 py-4 text-sm">
            No crew member matches.
          </p>
        ) : null}
      </nav>

      <div className="border-sidebar-border flex flex-col gap-0.5 border-t px-3 py-2.5">
        {changes ? (
          <button
            className="hover:bg-sidebar-accent flex w-full items-center gap-2.5 rounded-md p-2 text-left text-sm transition-colors disabled:opacity-50"
            disabled={!changes.available}
            onClick={changes.onPendingChanges}
            title={changes.available ? undefined : changes.reason}
            type="button"
          >
            <GitPullRequestIcon className="size-4" />
            Pending Changes
            <PendingBadge count={changes.pendingCount} />
          </button>
        ) : null}
        {onConnections ? (
          <button
            className="hover:bg-sidebar-accent flex w-full items-center gap-2.5 rounded-md p-2 text-left text-sm transition-colors"
            onClick={onConnections}
            type="button"
          >
            <PlugIcon className="size-4" />
            Connections
          </button>
        ) : null}
        <button
          className="hover:bg-sidebar-accent flex w-full items-center gap-2.5 rounded-md p-2 text-left text-sm transition-colors"
          onClick={onSettings}
          type="button"
        >
          <SettingsIcon className="size-4" />
          Settings
        </button>
      </div>

      <div className="border-sidebar-border flex items-center gap-2.5 border-t px-5 py-3">
        <Avatar account={account} initials={person.initials} size="sm" />
        <span className="flex min-w-0 flex-1 flex-col">
          <span className="truncate text-[13px] font-medium">
            {person.name}
          </span>
          <span className="text-muted-foreground flex items-center gap-1 text-xs">
            <span className="bg-online size-1.5 rounded-full" />
            <span className="truncate">{person.detail}</span>
          </span>
        </span>
        {onSignOut ? (
          <Button
            aria-label="Sign Out"
            onClick={onSignOut}
            size="icon-sm"
            title="Sign Out"
            variant="ghost"
          >
            <LogOutIcon className="size-4" />
          </Button>
        ) : null}
      </div>
    </aside>
  );
}

/** Phones: the first three crew members as big tiles, then the whole crew. */
export function MobileCrewList({
  account,
  changes,
  crew,
  history,
  moodOf,
  onConnections,
  onSettings,
  onSignOut,
}: CrewListProps) {
  const [searching, setSearching] = useState(false);
  const [query, setQuery] = useState("");
  const visible = crew.filter((member) => matches(member, query));
  const featured = query.trim() ? [] : crew.slice(0, 3);
  const person = personOf(account);

  return (
    <main className="bg-background flex min-h-svh flex-col" id="main">
      <header className="flex items-center gap-2 px-4 pt-5 pb-2">
        <DropdownMenu>
          <DropdownMenuTrigger
            aria-label={`${person.name}: account`}
            className="shrink-0 rounded-full"
          >
            <Avatar account={account} initials={person.initials} size="lg" />
          </DropdownMenuTrigger>
          <DropdownMenuContent>
            {changes?.available ? (
              <DropdownMenuItem onClick={changes.onPendingChanges}>
                Pending Changes
                <PendingBadge count={changes.pendingCount} />
              </DropdownMenuItem>
            ) : null}
            {onConnections ? (
              <DropdownMenuItem onClick={onConnections}>
                Connections
              </DropdownMenuItem>
            ) : null}
            <DropdownMenuItem onClick={onSettings}>Settings</DropdownMenuItem>
            {onSignOut ? (
              <DropdownMenuItem onClick={onSignOut}>Sign Out</DropdownMenuItem>
            ) : null}
          </DropdownMenuContent>
        </DropdownMenu>
        <div className="ml-1 flex min-w-0 flex-1 flex-col">
          <h1 className="text-base font-semibold">Lopsi Bot</h1>
          <span className="text-muted-foreground flex items-center gap-1 text-xs">
            <span className="bg-online size-1.5 rounded-full" />
            <span className="truncate">{person.detail}</span>
          </span>
        </div>
        <button
          aria-label={searching ? "Close Search" : "Search"}
          aria-pressed={searching}
          className="bg-background hover:bg-accent flex size-11 items-center justify-center rounded-full border transition-colors"
          onClick={() => {
            setSearching((open) => !open);
            setQuery("");
          }}
          type="button"
        >
          {searching ? (
            <XIcon className="size-[18px]" />
          ) : (
            <SearchIcon className="size-[18px]" />
          )}
        </button>
        {changes ? (
          <button
            aria-label="New Crew Member"
            className="bg-primary text-primary-foreground flex size-11 items-center justify-center rounded-full transition-opacity hover:opacity-90 disabled:opacity-50"
            disabled={!changes.available}
            onClick={changes.onNewMember}
            title={changes.available ? "New Crew Member" : changes.reason}
            type="button"
          >
            <PlusIcon className="size-[18px]" />
          </button>
        ) : null}
      </header>

      {searching ? (
        <div className="px-4 pt-2">
          <input
            aria-label="Search crew"
            autoFocus
            className="bg-background placeholder:text-muted-foreground focus-visible:ring-ring/50 h-11 w-full rounded-full border px-4 text-sm outline-none focus-visible:ring-3"
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search crew…"
            value={query}
          />
        </div>
      ) : null}

      {featured.length > 0 ? (
        <div className="grid grid-cols-3 gap-2 px-4 pt-4 pb-5">
          {featured.map((member) => (
            <Link
              className="bg-muted/60 hover:bg-muted flex flex-col items-center gap-2 rounded-[14px] px-1 py-3 transition-colors"
              href={memberHref(member.id, history)}
              key={member.id}
            >
              <Mascot kind={member.mascot} mood={moodOf(member)} size={72} />
              <span className="max-w-full truncate text-[13px] font-medium">
                {member.name}
              </span>
            </Link>
          ))}
        </div>
      ) : null}

      <div className="text-muted-foreground px-5 pt-2 pb-1.5 text-xs font-medium">
        All Crew
      </div>
      <nav aria-label="Crew" className="flex flex-col px-2 pb-6">
        {visible.map((member) => (
          <Link
            className="hover:bg-accent flex min-h-16 items-center gap-3 rounded-xl px-3 py-2 text-left transition-colors"
            href={memberHref(member.id, history)}
            key={member.id}
          >
            <Mascot kind={member.mascot} mood={moodOf(member)} size={48} />
            <span className="flex min-w-0 flex-1 flex-col gap-0.5">
              <span className="flex items-baseline gap-2">
                <span className="flex-1 text-[15px] font-semibold">
                  {member.name}
                </span>
                <span className="text-muted-foreground text-xs">
                  {timeOf(member, history)}
                </span>
              </span>
              <span className="text-muted-foreground truncate text-[13px]">
                {previewOf(member, history)}
              </span>
            </span>
          </Link>
        ))}
        {visible.length === 0 ? (
          <p className="text-muted-foreground px-3 py-4 text-sm">
            No crew member matches.
          </p>
        ) : null}
      </nav>
    </main>
  );
}

function Avatar({
  account,
  initials,
  size,
}: {
  readonly account: Account;
  readonly initials: string;
  readonly size: "sm" | "lg";
}) {
  const [failed, setFailed] = useState(false);
  const box = size === "sm" ? "size-8 text-xs" : "size-10 text-[13px]";
  if (account.kind === "vercel" && account.image && !failed) {
    return (
      // biome-ignore lint/performance/noImgElement: a remote avatar from Vercel, not a static asset.
      // biome-ignore lint/a11y/noNoninteractiveElementInteractions: onError is a load failure, not a user action.
      <img
        alt=""
        className={cn("shrink-0 rounded-full object-cover", box)}
        height={size === "sm" ? 32 : 40}
        onError={() => setFailed(true)}
        src={account.image}
        width={size === "sm" ? 32 : 40}
      />
    );
  }
  return (
    <span
      className={cn(
        "bg-secondary flex shrink-0 items-center justify-center rounded-full font-semibold",
        box
      )}
    >
      {initials}
    </span>
  );
}
