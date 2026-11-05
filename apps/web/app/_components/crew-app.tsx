"use client";

import { useRouter } from "next/navigation";
import { useCallback, useState } from "react";
import { PromptInputProvider } from "@/components/ai-elements/prompt-input";
import type { MascotMood } from "@/components/mascot";
import { authClient } from "@/lib/auth-client";
import { useMergedHistory } from "@/lib/chat-history";
import type { ChatRecord, Transcript } from "@/lib/chat-store";
import { CREW, type CrewMember } from "@/lib/crew.generated";
import { faviconFor, useFavicon } from "@/lib/favicon";
import { useIsPhone } from "@/lib/use-phone";
import { signOutOfPassword } from "../login/actions";
import { type Account, ownerOf } from "./account";
import type { ConnectorSummary } from "./connections-dialog";
import { CrewChat } from "./crew-chat";
import { CrewSidebar, MobileCrewList } from "./crew-list";
import { useDashboardDialogs } from "./dashboard-dialogs";

/**
 * The dashboard: the crew list and, when a member is selected, its chat. Ported
 * from lopsi-bot's App.tsx; wide screens show both, phones one at a time.
 */
export function CrewApp({
  account,
  changes,
  chatList,
  connectors,
  memberId,
  savedTranscript,
  sessionId,
}: {
  readonly account: Account;
  /** Production mode: the person's chats from the server; absent where the list is browser-only. */
  readonly chatList?: readonly ChatRecord[];
  /** Whether configuration by pull request is possible; absent in local development. */
  readonly changes?: { readonly available: boolean; readonly reason?: string };
  /** The configured connectors, names only. */
  readonly connectors: readonly ConnectorSummary[];
  readonly memberId?: string;
  /** Production mode: the open chat's saved transcript, when it has one. */
  readonly savedTranscript?: Transcript;
  readonly sessionId?: string;
}) {
  const router = useRouter();
  const phone = useIsPhone();
  const owner = ownerOf(account);
  const history = useMergedHistory(owner, chatList);
  const [moods, setMoods] = useState<Record<string, MascotMood>>({});
  const { actions, dialogs } = useDashboardDialogs({
    account,
    changes,
    connectors,
  });
  const member = CREW.find((candidate) => candidate.id === memberId);

  const moodOf = (candidate: CrewMember): MascotMood =>
    moods[candidate.id] ?? "idle";
  const onMood = useCallback(
    (mood: MascotMood) => {
      if (memberId !== undefined) {
        setMoods((current) =>
          current[memberId] === mood
            ? current
            : { ...current, [memberId]: mood }
        );
      }
    },
    [memberId]
  );
  useFavicon(
    faviconFor(
      CREW.map((m) => ({ ...m, kind: m.mascot })),
      (m) => moodOf(m),
      member?.id
    )
  );

  const onSignOut = signOutFor(account);

  const listProps = {
    account,
    crew: CREW,
    history,
    moodOf,
    onSettings: actions.openSettings,
    selectedId: member?.id,
    ...(onSignOut ? { onSignOut } : {}),
    ...(actions.openConnections
      ? { onConnections: actions.openConnections }
      : {}),
    ...(changes
      ? {
          changes: {
            ...changes,
            onNewMember: actions.openNewMember ?? (() => undefined),
            onPendingChanges: actions.openPendingChanges ?? (() => undefined),
            pendingCount: actions.pendingCount ?? 0,
          },
        }
      : {}),
  };

  const chat =
    member === undefined ? null : (
      // A new provider and chat per member and session: eve's hook must remount when either changes.
      <PromptInputProvider key={`${member.id}:${sessionId ?? "new"}`}>
        <CrewChat
          account={account}
          history={history[member.id]}
          member={member}
          onMood={onMood}
          owner={owner}
          persist={chatList !== undefined}
          saved={savedTranscript}
          {...(actions.openEdit
            ? { onEdit: () => actions.openEdit?.(member.id) }
            : {})}
          {...(phone ? { onBack: () => router.push("/") } : {})}
          {...(sessionId === undefined ? {} : { sessionId })}
        />
      </PromptInputProvider>
    );

  if (phone) {
    return (
      <>
        {chat ?? <MobileCrewList {...listProps} />}
        {dialogs}
      </>
    );
  }

  return (
    <div className="bg-background flex min-h-svh flex-wrap">
      {dialogs}
      <CrewSidebar {...listProps} />
      {chat ?? (
        <main
          className="flex h-svh min-w-0 flex-[999_1_560px] flex-col items-center justify-center gap-2 p-8 text-center"
          id="main"
        >
          <h1 className="text-base font-semibold">
            {CREW.length === 0
              ? "No Crew Yet"
              : "Choose Someone From Your Crew"}
          </h1>
          <p className="text-muted-foreground max-w-sm text-sm">
            {CREW.length === 0
              ? "Add an agent under agents/<name>/ and run pnpm crew."
              : "Each crew member is an eve agent with its own instructions and tools."}
          </p>
        </main>
      )}
    </div>
  );
}

/** Signing out of the current mode; nothing to sign out of in local development. */
function signOutFor(account: Account): (() => void) | undefined {
  if (account.kind === "vercel") {
    return () => {
      authClient
        .signOut({
          fetchOptions: { onSuccess: () => window.location.assign("/") },
        })
        .catch(() => undefined);
    };
  }
  if (account.kind === "password") {
    return () => {
      signOutOfPassword().catch(() => undefined);
    };
  }
}
