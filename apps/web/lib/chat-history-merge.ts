import type { ChatHistory, MemberHistory } from "./chat-history";
import type { ChatRecord } from "./chat-store";

/** How many chats a member's list keeps. */
export const MAX_CHATS = 50;

function newer<T extends { readonly updatedAt?: string }>(
  a: T | undefined,
  b: T | undefined
): T | undefined {
  if (a === undefined || b === undefined) {
    return a ?? b;
  }
  return (b.updatedAt ?? "") > (a.updatedAt ?? "") ? b : a;
}

/** This browser's history with the server's chat list merged in, per chat the newer copy. */
export function mergeHistory(
  local: ChatHistory,
  server: readonly ChatRecord[]
): ChatHistory {
  const merged: Record<string, MemberHistory> = { ...local };
  const byMember = Map.groupBy(server, (record) => record.memberId);
  for (const [memberId, records] of byMember) {
    const member = merged[memberId] ?? { chats: [] };
    const chats = new Map(member.chats.map((chat) => [chat.sessionId, chat]));
    for (const { sessionId, title, updatedAt } of records) {
      const chat = newer(chats.get(sessionId), { sessionId, title, updatedAt });
      if (chat) {
        chats.set(sessionId, chat);
      }
    }
    const latest = records.find((record) => record.preview !== undefined);
    const preview = newer<{
      readonly preview?: string;
      readonly updatedAt?: string;
    }>(
      member.preview === undefined
        ? undefined
        : { preview: member.preview, updatedAt: member.updatedAt },
      latest
    );
    const updatedAt = newer<{ readonly updatedAt?: string }>(
      member,
      records[0]
    )?.updatedAt;
    merged[memberId] = {
      ...member,
      chats: [...chats.values()]
        .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
        .slice(0, MAX_CHATS),
      ...(preview?.preview === undefined ? {} : { preview: preview.preview }),
      ...(updatedAt === undefined ? {} : { updatedAt }),
    };
  }
  return merged;
}
