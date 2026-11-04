"use client";

import { useSyncExternalStore } from "react";

/**
 * Each crew member's chats, kept in this browser's localStorage. eve has no API
 * that lists sessions, so this is the only index; it doesn't follow a person to
 * another device. Stored per signed-in person (`owner`), so people who share a
 * browser don't see each other's lists.
 */

/** One past or current chat with a crew member. */
interface ChatSummary {
  readonly sessionId: string;
  /** The first message, shortened. */
  readonly title: string;
  readonly updatedAt: string;
}

/** What the crew list shows for one member, and its chats, newest first. */
export interface MemberHistory {
  readonly chats: readonly ChatSummary[];
  /** The chat that opens when the member is selected. */
  readonly current?: string;
  /** The latest reply, shortened. */
  readonly preview?: string;
  readonly updatedAt?: string;
}

export type ChatHistory = Readonly<Record<string, MemberHistory>>;

const VERSION = "v1";
const MAX_CHATS = 50;
const EMPTY: ChatHistory = {};

const listeners = new Set<() => void>();
const cache = new Map<string, ChatHistory>();

function storageKey(owner: string): string {
  return `lopsi:chats:${VERSION}:${owner}`;
}

function read(owner: string): ChatHistory {
  const cached = cache.get(owner);
  if (cached) {
    return cached;
  }
  let history: ChatHistory = EMPTY;
  try {
    const raw = window.localStorage.getItem(storageKey(owner));
    const parsed: unknown = raw === null ? null : JSON.parse(raw);
    if (
      parsed !== null &&
      typeof parsed === "object" &&
      !Array.isArray(parsed)
    ) {
      history = parsed as ChatHistory;
    }
  } catch {
    // Unavailable or corrupt storage: start empty.
  }
  cache.set(owner, history);
  return history;
}

function write(owner: string, history: ChatHistory): void {
  cache.set(owner, history);
  try {
    window.localStorage.setItem(storageKey(owner), JSON.stringify(history));
  } catch {
    // Storage full or blocked: keep the in-memory copy for this page.
  }
  for (const listener of listeners) {
    listener();
  }
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  // Another tab changed the list.
  const onStorage = (event: StorageEvent) => {
    if (event.key?.startsWith("lopsi:chats:")) {
      cache.clear();
      listener();
    }
  };
  window.addEventListener("storage", onStorage);
  return () => {
    listeners.delete(listener);
    window.removeEventListener("storage", onStorage);
  };
}

/**
 * The owner's chat history, re-rendering when it changes here or in another tab.
 * Empty during server rendering.
 */
export function useChatHistory(owner: string): ChatHistory {
  return useSyncExternalStore(
    subscribe,
    () => read(owner),
    () => EMPTY
  );
}

function updateMember(
  owner: string,
  memberId: string,
  change: (member: MemberHistory) => MemberHistory
): void {
  const history = read(owner);
  write(owner, {
    ...history,
    [memberId]: change(history[memberId] ?? { chats: [] }),
  });
}

function shorten(text: string, length: number): string {
  const flat = text.replace(/\s+/gu, " ").trim();
  return flat.length > length ? `${flat.slice(0, length - 1)}…` : flat;
}

/** Records a new chat, from its first message, and makes it the member's current one. */
export function recordChat(
  owner: string,
  memberId: string,
  sessionId: string,
  firstMessage: string
): void {
  const now = new Date().toISOString();
  updateMember(owner, memberId, (member) => ({
    ...member,
    chats: [
      {
        sessionId,
        title: shorten(firstMessage, 60) || "New chat",
        updatedAt: now,
      },
      ...member.chats.filter((chat) => chat.sessionId !== sessionId),
    ].slice(0, MAX_CHATS),
    current: sessionId,
    updatedAt: now,
  }));
}

/** Notes a finished reply: the member's preview and when it happened. */
export function recordReply(
  owner: string,
  memberId: string,
  sessionId: string,
  reply: string
): void {
  const now = new Date().toISOString();
  updateMember(owner, memberId, (member) => ({
    ...member,
    chats: member.chats.map((chat) =>
      chat.sessionId === sessionId ? { ...chat, updatedAt: now } : chat
    ),
    preview: shorten(reply, 100) || member.preview,
    updatedAt: now,
  }));
}

/** Sets which chat opens when the member is selected; `undefined` starts a new one next time. */
export function setCurrentChat(
  owner: string,
  memberId: string,
  sessionId: string | undefined
): void {
  updateMember(owner, memberId, ({ current: _previous, ...member }) =>
    sessionId === undefined ? member : { ...member, current: sessionId }
  );
}

/** Where selecting a member goes: its current chat, or a new one. */
export function memberHref(memberId: string, history: ChatHistory): string {
  const current = history[memberId]?.current;
  const base = `/c/${encodeURIComponent(memberId)}`;
  return current === undefined
    ? base
    : `${base}/s/${encodeURIComponent(current)}`;
}
