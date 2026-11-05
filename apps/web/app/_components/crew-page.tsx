import { notFound } from "next/navigation";
import { currentChatOwner } from "@/lib/chat-owner";
import {
  type ChatRecord,
  listChats,
  loadTranscript,
  type Transcript,
} from "@/lib/chat-store";
import { CREW } from "@/lib/crew";
import { isSessionOwnedBy } from "@/lib/session-owners";
import { CrewApp } from "./crew-app";
import { dashboardFeatures, pageAccess } from "./page-access";

/**
 * Every crew page: checks access on the server, then renders the dashboard with
 * the selected crew member and chat, if any.
 */
export async function CrewPage({
  memberId,
  path,
  sessionId,
}: {
  readonly memberId?: string;
  /** This page's path, so starter-mode sign-in can return to it. */
  readonly path: string;
  readonly sessionId?: string;
}) {
  if (
    memberId !== undefined &&
    !CREW.some((member) => member.id === memberId)
  ) {
    notFound();
  }

  const access = await pageAccess(path);
  if ("page" in access) {
    return access.page;
  }
  const { account } = access;
  const { changes, connectors } = dashboardFeatures(account);
  const history = await savedHistory(sessionId);
  return (
    <CrewApp
      account={account}
      changes={changes}
      connectors={connectors}
      memberId={memberId}
      sessionId={sessionId}
      {...history}
    />
  );
}

/**
 * Production mode's server-side history: the person's chat list, and the open
 * chat's saved transcript when it's theirs. A storage failure falls back to
 * what eve and the browser have.
 */
async function savedHistory(sessionId: string | undefined): Promise<{
  chatList?: readonly ChatRecord[];
  savedTranscript?: Transcript;
}> {
  const owner = await currentChatOwner();
  if (owner === undefined) {
    return {};
  }
  const [chatList, savedTranscript] = await Promise.all([
    listChats(owner).catch(() => undefined),
    sessionId === undefined
      ? undefined
      : isSessionOwnedBy(sessionId, owner)
          .then((owned) => (owned ? loadTranscript(sessionId) : undefined))
          .catch(() => undefined),
  ]);
  return {
    chatList: chatList ?? [],
    ...(savedTranscript ? { savedTranscript } : {}),
  };
}
