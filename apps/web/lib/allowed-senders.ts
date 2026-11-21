/**
 * Who may write to the crew from outside the dashboard: email senders and
 * Telegram users. Anyone can send an email or message a bot, so everyone else
 * is dropped without a reply.
 *
 * Settings edits each list, kept in the private Blob store (`BLOB_STORE_ID`)
 * so a change applies to the next message, without a redeploy. The older
 * environment variables (LOPSI_EMAIL_SENDERS, LOPSI_TELEGRAM_SENDERS) still
 * count too.
 *
 * @packageDocumentation
 */

import { BlobNotFoundError, get, put } from "@vercel/blob";

export type SenderList = "email" | "telegram";

const VARIABLES: Record<SenderList, string> = {
  email: "LOPSI_EMAIL_SENDERS",
  telegram: "LOPSI_TELEGRAM_SENDERS",
};

const PREFIX = "lopsi/allowed-senders";
const MAX_ENTRIES = 200;
const LEADING_AT = /^@/u;
/** An address (`ana@example.com`) or a whole domain (`@example.com`). */
const EMAIL_ENTRY = /^(?:[^\s@,]+)?@[a-z0-9.-]+\.[a-z]{2,}$/u;
/** A username (`ana_b`) or a numeric user id. */
const TELEGRAM_ENTRY = /^(?:[a-z][a-z0-9_]{3,31}|\d{1,20})$/u;

/** Whether the private Blob store is connected, so the lists can be edited. */
export function senderListsEditable(): boolean {
  return Boolean(
    process.env.BLOB_STORE_ID || process.env.BLOB_READ_WRITE_TOKEN
  );
}

/** An entry as it's stored and compared: lowercase, and a Telegram username without its `@`. */
export function normalizeSender(list: SenderList, entry: string): string {
  const trimmed = entry.trim().toLowerCase();
  return list === "telegram" ? trimmed.replace(LEADING_AT, "") : trimmed;
}

/** Whether an entry has the list's shape. */
export function isSenderEntry(list: SenderList, entry: string): boolean {
  return (list === "email" ? EMAIL_ENTRY : TELEGRAM_ENTRY).test(entry);
}

function fromVariable(list: SenderList): string[] {
  return (process.env[VARIABLES[list]] ?? "")
    .split(",")
    .map((entry) => normalizeSender(list, entry))
    .filter(Boolean);
}

/** The entries saved from Settings. */
export async function savedSenders(list: SenderList): Promise<string[]> {
  if (!senderListsEditable()) {
    return [];
  }
  try {
    const result = await get(`${PREFIX}/${list}.json`, {
      access: "private",
      useCache: false,
    });
    if (result === null) {
      return [];
    }
    const entries: unknown = JSON.parse(
      await new Response(result.stream).text()
    );
    return Array.isArray(entries)
      ? entries.filter((entry): entry is string => typeof entry === "string")
      : [];
  } catch (error) {
    if (error instanceof BlobNotFoundError) {
      return [];
    }
    throw error;
  }
}

/** Everyone a list allows: what Settings saved and the environment variable. */
export async function allowedSenders(list: SenderList): Promise<string[]> {
  return [...new Set([...(await savedSenders(list)), ...fromVariable(list)])];
}

/** The entries only the environment variable adds, which Settings can't remove. */
export function senderVariableEntries(list: SenderList): string[] {
  return fromVariable(list);
}

/** Saves a list from Settings, refusing anything that isn't an entry. */
export async function saveSenders(
  list: SenderList,
  entries: readonly string[]
): Promise<{ readonly error?: string }> {
  const normalized = [
    ...new Set(entries.map((entry) => normalizeSender(list, entry))),
  ].filter(Boolean);
  const invalid = normalized.filter((entry) => !isSenderEntry(list, entry));
  if (invalid.length > 0) {
    return {
      error: `Not ${list === "email" ? "an address or @domain" : "a username or user id"}: ${invalid.join(", ")}`,
    };
  }
  if (normalized.length > MAX_ENTRIES) {
    return { error: `At most ${MAX_ENTRIES} entries.` };
  }
  await put(`${PREFIX}/${list}.json`, JSON.stringify(normalized.sort()), {
    access: "private",
    addRandomSuffix: false,
    allowOverwrite: true,
    contentType: "application/json",
  });
  return {};
}
