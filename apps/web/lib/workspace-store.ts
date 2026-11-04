/**
 * Snapshots of a chat's sandbox workspace for production mode, in the private
 * Blob store: which files it holds, and the content of small text files. The
 * agent's hooks/workspace.ts takes one after each turn that used the shell or
 * wrote a file; the computer panel reads it for the chat's owner.
 *
 * @packageDocumentation
 */

import { BlobNotFoundError, get, put } from "@vercel/blob";

/** One file in the workspace. */
export interface WorkspaceFile {
  /** The text, for small text files. */
  readonly content?: string;
  /** Modified, as an ISO time. */
  readonly modifiedAt?: string;
  /** Relative to the workspace. */
  readonly path: string;
  readonly size: number;
  /** Why the content isn't kept: not text, or over the size limits. */
  readonly skipped?: "binary" | "large";
}

export interface WorkspaceSnapshot {
  readonly files: readonly WorkspaceFile[];
  /** More files existed than a snapshot lists. */
  readonly partial: boolean;
  readonly takenAt: string;
}

const PREFIX = "lopsi/workspaces";
const SESSION_ID = /^wrun_[0-9A-Za-z]{10,64}$/u;

function pathOf(sessionId: string): string | undefined {
  return SESSION_ID.test(sessionId) ? `${PREFIX}/${sessionId}.json` : undefined;
}

/** Saves a chat's latest workspace snapshot. */
export async function saveWorkspace(
  sessionId: string,
  snapshot: WorkspaceSnapshot
): Promise<void> {
  const pathname = pathOf(sessionId);
  if (pathname === undefined) {
    return;
  }
  await put(pathname, JSON.stringify(snapshot), {
    access: "private",
    addRandomSuffix: false,
    allowOverwrite: true,
    contentType: "application/json",
  });
}

/** A chat's latest workspace snapshot. Callers check the chat's owner first. */
export async function loadWorkspace(
  sessionId: string
): Promise<WorkspaceSnapshot | undefined> {
  const pathname = pathOf(sessionId);
  if (pathname === undefined) {
    return;
  }
  try {
    const result = await get(pathname, { access: "private", useCache: false });
    return result === null
      ? undefined
      : (JSON.parse(
          await new Response(result.stream).text()
        ) as WorkspaceSnapshot);
  } catch (error) {
    if (error instanceof BlobNotFoundError) {
      return;
    }
    throw error;
  }
}
