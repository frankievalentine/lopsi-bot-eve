/**
 * Server-side chat history for production mode, in the same private Blob store
 * as the chat owners.
 *
 * - The chat list: one small record per chat under `lopsi/chats/<owner>/`,
 *   written by the agent's hooks (`agents/<name>/agent/hooks/chats.ts`) as
 *   messages arrive and replies finish, so it updates while no browser is open.
 * - Transcripts: the events and session cursor the browser has, saved by the
 *   chat (`/api/chats/<id>/transcript`) and loaded when the chat reopens. eve
 *   deletes a private session's run data when the session ends, so this is
 *   what keeps an ended chat readable.
 *
 * Starter mode has no store; its chat list stays in the browser.
 *
 * @packageDocumentation
 */

import { createHash } from "node:crypto";
import { BlobNotFoundError, get, list, put } from "@vercel/blob";
import { plainReply } from "./reply-preview";
import type { SessionOwner } from "./session-owners";

/** One chat in a person's list. */
export interface ChatRecord {
  readonly createdAt: string;
  readonly memberId: string;
  /** The latest reply, shortened. */
  readonly preview?: string;
  readonly sessionId: string;
  /** The first message, shortened. */
  readonly title: string;
  readonly updatedAt: string;
}

/** What the browser saves for a chat: eve's events and session cursor, as eve gave them. */
export interface Transcript {
  readonly events: readonly unknown[];
  readonly session: unknown;
}

const LIST_PREFIX = "lopsi/chats";
const TRANSCRIPT_PREFIX = "lopsi/chat-transcripts";
const SESSION_ID = /^wrun_[0-9A-Za-z]{10,64}$/u;
const MEMBER_ID = /^[a-z][a-z0-9-]{0,40}$/u;
/** The most recent chats a list loads. */
const MAX_LISTED = 100;
/** Vercel Functions accept request bodies up to 4.5 MB. */
export const MAX_TRANSCRIPT_BYTES = 4_000_000;

/** A person's folder: a hash, so ids never shape a Blob pathname. */
function ownerFolder(owner: SessionOwner): string {
  const hash = createHash("sha256")
    .update(`${owner.authenticator}\0${owner.principalId}`)
    .digest("hex")
    .slice(0, 32);
  return `${LIST_PREFIX}/${hash}`;
}

function recordPath(owner: SessionOwner, sessionId: string): string {
  return `${ownerFolder(owner)}/${sessionId}.json`;
}

function shorten(text: string, length: number): string {
  const flat = text.replace(/\s+/gu, " ").trim();
  return flat.length > length ? `${flat.slice(0, length - 1)}…` : flat;
}

async function readJson<T>(pathname: string): Promise<T | undefined> {
  let result: Awaited<ReturnType<typeof get>>;
  try {
    result = await get(pathname, { access: "private", useCache: false });
  } catch (error) {
    if (error instanceof BlobNotFoundError) {
      return;
    }
    throw error;
  }
  if (result === null) {
    return;
  }
  return JSON.parse(await new Response(result.stream).text()) as T;
}

async function writeJson(pathname: string, value: unknown): Promise<void> {
  await put(pathname, JSON.stringify(value), {
    access: "private",
    addRandomSuffix: false,
    allowOverwrite: true,
    contentType: "application/json",
  });
}

// The agent writes each chat's record from one session's hooks, in order, so
// the instance's last copy is a fine starting point for the next write.
const records = new Map<string, ChatRecord>();

async function updateRecord(
  owner: SessionOwner,
  sessionId: string,
  change: (record: ChatRecord | undefined) => ChatRecord | undefined
): Promise<void> {
  if (!SESSION_ID.test(sessionId)) {
    return;
  }
  const pathname = recordPath(owner, sessionId);
  const current =
    records.get(pathname) ?? (await readJson<ChatRecord>(pathname));
  const next = change(current);
  if (next === undefined || next === current) {
    return;
  }
  await writeJson(pathname, next);
  records.set(pathname, next);
}

/** Notes a message a person sent: creates the chat from its first one, or bumps it. */
export async function recordChatMessage(
  owner: SessionOwner,
  memberId: string,
  sessionId: string,
  text: string
): Promise<void> {
  if (!MEMBER_ID.test(memberId)) {
    return;
  }
  const now = new Date().toISOString();
  await updateRecord(owner, sessionId, (record) =>
    record
      ? { ...record, updatedAt: now }
      : {
          createdAt: now,
          memberId,
          sessionId,
          title: shorten(text, 60) || "New chat",
          updatedAt: now,
        }
  );
}

/** Notes a finished reply: the chat's preview and when it happened. */
export async function recordChatReply(
  owner: SessionOwner,
  sessionId: string,
  reply: string
): Promise<void> {
  const preview = shorten(plainReply(reply), 100);
  if (!preview) {
    return;
  }
  await updateRecord(owner, sessionId, (record) =>
    record
      ? { ...record, preview, updatedAt: new Date().toISOString() }
      : undefined
  );
}

/** A person's chats, newest first. */
export async function listChats(
  owner: SessionOwner
): Promise<readonly ChatRecord[]> {
  const { blobs } = await list({ prefix: `${ownerFolder(owner)}/` });
  const recent = [...blobs]
    .sort((a, b) => b.uploadedAt.getTime() - a.uploadedAt.getTime())
    .slice(0, MAX_LISTED);
  const loaded = await Promise.all(
    recent.map((blob) =>
      readJson<ChatRecord>(blob.pathname).catch(() => undefined)
    )
  );
  return loaded
    .filter((record): record is ChatRecord => record !== undefined)
    .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
}

function transcriptPath(sessionId: string): string | undefined {
  return SESSION_ID.test(sessionId)
    ? `${TRANSCRIPT_PREFIX}/${sessionId}.json`
    : undefined;
}

/** Saves a chat's transcript. Callers check the chat's owner first. */
export async function saveTranscript(
  sessionId: string,
  transcript: Transcript
): Promise<void> {
  const pathname = transcriptPath(sessionId);
  if (pathname !== undefined) {
    await writeJson(pathname, transcript);
  }
}

/** A chat's saved transcript, if any. Callers check the chat's owner first. */
export function loadTranscript(
  sessionId: string
): Promise<Transcript | undefined> {
  const pathname = transcriptPath(sessionId);
  return pathname === undefined
    ? Promise.resolve(undefined)
    : readJson<Transcript>(pathname);
}
