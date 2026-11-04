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
import { ConnectionsDialog, type ConnectorSummary } from "./connections-dialog";
import { CrewChat } from "./crew-chat";
import { CrewSidebar, MobileCrewList } from "./crew-list";
import { MemberConfigDialog } from "./member-config-dialog";
import {
  PendingChangesDialog,
  usePendingCount,
} from "./pending-changes-dialog";

type MemberDialogMode =
  | { readonly kind: "edit"; readonly memberId: string }
  | { readonly kind: "new" };

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
  const [connectionsOpen, setConnectionsOpen] = useState(false);
  const [memberDialog, setMemberDialog] = useState<MemberDialogMode | null>(
    null
  );
  const [pendingOpen, setPendingOpen] = useState(false);
  const pending = usePendingCount(changes?.available === true);
  const onPendingOpenChange = (next: boolean) => {
    setPendingOpen(next);
    if (!next) {
      pending.refresh();
    }
  };
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
    selectedId: member?.id,
    ...(onSignOut ? { onSignOut } : {}),
    ...(connectors.length > 0
      ? { onConnections: () => setConnectionsOpen(true) }
      : {}),
    ...(changes
      ? {
          changes: {
            ...changes,
            onNewMember: () => setMemberDialog({ kind: "new" }),
            onPendingChanges: () => setPendingOpen(true),
            pendingCount: pending.count ?? 0,
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
          {...(changes?.available
            ? {
                onEdit: () =>
                  setMemberDialog({ kind: "edit", memberId: member.id }),
              }
            : {})}
          {...(phone ? { onBack: () => router.push("/") } : {})}
          {...(sessionId === undefined ? {} : { sessionId })}
        />
      </PromptInputProvider>
    );

  const connectionsDialog = (
    <>
      {connectors.length > 0 ? (
        <ConnectionsDialog
          account={account}
          connectors={connectors}
          onOpenChange={setConnectionsOpen}
          open={connectionsOpen}
        />
      ) : null}
      {changes?.available ? (
        <>
          <MemberConfigDialog
            mode={memberDialog ?? { kind: "new" }}
            onOpenChange={(next) => !next && setMemberDialog(null)}
            onPullRequest={pending.refresh}
            open={memberDialog !== null}
          />
          <PendingChangesDialog
            onOpenChange={onPendingOpenChange}
            open={pendingOpen}
          />
        </>
      ) : null}
    </>
  );

  if (phone) {
    return (
      <>
        {chat ?? <MobileCrewList {...listProps} />}
        {connectionsDialog}
      </>
    );
  }

  return (
    <div className="bg-background flex min-h-svh flex-wrap">
      {connectionsDialog}
      <CrewSidebar {...listProps} />
      {chat ?? (
        <main className="flex h-svh min-h-[640px] min-w-0 flex-[999_1_560px] flex-col items-center justify-center gap-2 p-8 text-center">
          <h1 className="text-base font-semibold">
            {CREW.length === 0
              ? "No crew yet"
              : "Choose someone from your crew"}
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
