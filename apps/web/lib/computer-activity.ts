/**
 * What a chat's sandbox did, from eve's call observations: the shell commands
 * it ran and the files it wrote, edited or read. eve has no API that lists a sandbox's
 * files; in production mode a snapshot taken after each turn
 * (workspace-store.ts) adds the files the shell made on its own.
 *
 * @packageDocumentation
 */

import type { CallObservation, CallState } from "eve/events";
import type { WorkspaceSnapshot } from "./workspace-store";

/** One `bash` call. */
export interface CommandRun {
  readonly callId: string;
  readonly command: string;
  readonly error?: string;
  readonly exitCode?: number;
  /** Still running past bash's wait; its output isn't in yet. */
  readonly running: boolean;
  readonly startedAt?: string;
  readonly state: CallState;
  readonly stderr?: string;
  readonly stdout?: string;
  /** eve kept the output out of the stream (too large); not shown here. */
  readonly stored: boolean;
  readonly truncated: boolean;
}

/** A file the agent wrote, edited or read, with the latest content the chat saw. */
export interface FileEntry {
  readonly at?: string;
  /** Absent for an edit whose result the chat can't rebuild (see `edited`). */
  readonly content?: string;
  /** Written, edited or read in this chat, or only seen in the workspace snapshot. */
  readonly how: "read" | "written" | "edited" | "in workspace";
  /** Only part of the file was read. */
  readonly partial: boolean;
  /** Relative to the workspace. */
  readonly path: string;
  readonly size?: number;
  /** Why there's no content: not text, or too large to keep. */
  readonly skipped?: "binary" | "large";
  /** eve kept the content out of the stream (too large); not shown here. */
  readonly stored: boolean;
}

export interface ComputerActivity {
  readonly commands: readonly CommandRun[];
  /** Newest first. */
  readonly files: readonly FileEntry[];
}

type Json = Record<string, unknown>;

const WORKSPACE = /^(?:\/workspace\/?|\.\/)/u;
const LINE_NUMBER = /^\d+: /u;
const FILE_TOOLS = new Set(["edit_file", "read_file", "write_file"]);

function objectOf(value: unknown): Json {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? (value as Json)
    : {};
}

function stringOf(value: unknown): string | undefined {
  return typeof value === "string" ? value : undefined;
}

function workspacePath(value: unknown): string | undefined {
  const path = stringOf(value);
  return path === undefined ? undefined : path.replace(WORKSPACE, "");
}

function commandOf(call: CallObservation): CommandRun {
  const input = objectOf(call.input);
  const output = objectOf(call.output);
  const { exitCode } = output;
  return {
    callId: call.callId,
    command: stringOf(input.command) ?? call.label,
    running: output.status === "running",
    state: call.state,
    stored: call.outputRef !== undefined,
    truncated: output.truncated === true,
    ...(call.startedAt === undefined ? {} : { startedAt: call.startedAt }),
    ...(call.error?.message === undefined ? {} : { error: call.error.message }),
    ...(typeof exitCode === "number" ? { exitCode } : {}),
    ...(stringOf(output.stdout) === undefined
      ? {}
      : { stdout: stringOf(output.stdout) }),
    ...(stringOf(output.stderr) === undefined
      ? {}
      : { stderr: stringOf(output.stderr) }),
  };
}

/** read_file numbers each line (`12: text`); the panel shows the file itself. */
function withoutLineNumbers(content: string): string {
  return content
    .split("\n")
    .map((line) => line.replace(LINE_NUMBER, ""))
    .join("\n");
}

/**
 * edit_file's replacements applied to the text the chat last saw, when each
 * `oldText` occurs exactly once in it and none overlap. eve also matches
 * loosely (trailing whitespace, smart quotes); this doesn't, so such an edit
 * leaves the content to the workspace snapshot.
 */
function edited(before: string, edits: unknown): string | undefined {
  if (!Array.isArray(edits)) {
    return;
  }
  const spans: { end: number; start: number; text: string }[] = [];
  for (const edit of edits) {
    const { newText, oldText } = objectOf(edit);
    if (typeof oldText !== "string" || typeof newText !== "string") {
      return;
    }
    const start = before.indexOf(oldText);
    if (oldText === "" || start === -1 || before.includes(oldText, start + 1)) {
      return;
    }
    spans.push({ end: start + oldText.length, start, text: newText });
  }
  spans.sort((a, b) => a.start - b.start);
  let after = "";
  let at = 0;
  for (const span of spans) {
    if (span.start < at) {
      return;
    }
    after += before.slice(at, span.start) + span.text;
    at = span.end;
  }
  return after + before.slice(at);
}

function fileOf(
  call: CallObservation,
  seen: ReadonlyMap<string, FileEntry>
): FileEntry | undefined {
  if (call.state !== "completed") {
    return;
  }
  const input = objectOf(call.input);
  const output = objectOf(call.output);
  const path = workspacePath(output.path) ?? workspacePath(input.filePath);
  if (path === undefined) {
    return;
  }
  const at = call.endedAt ?? call.startedAt;
  const timing = at === undefined ? {} : { at };
  if (call.name === "edit_file") {
    const before = seen.get(path);
    const content =
      before?.content === undefined || before.partial
        ? undefined
        : edited(before.content, input.edits);
    return {
      how: "edited",
      partial: false,
      path,
      stored: false,
      ...timing,
      ...(content === undefined ? {} : { content }),
    };
  }
  if (call.name === "write_file") {
    const content = stringOf(input.content);
    return {
      how: "written",
      partial: false,
      path,
      stored: call.inputRef !== undefined,
      ...timing,
      ...(content === undefined ? {} : { content }),
    };
  }
  const content = stringOf(output.content);
  return {
    how: "read",
    partial: output.truncated === true,
    path,
    stored: call.outputRef !== undefined,
    ...timing,
    ...(content === undefined ? {} : { content: withoutLineNumbers(content) }),
  };
}

/** The sandbox's commands, in order, and its files, newest first, from a chat's tool calls. */
export function computerActivity(
  calls: readonly CallObservation[]
): ComputerActivity {
  const commands: CommandRun[] = [];
  const files = new Map<string, FileEntry>();
  for (const call of calls) {
    if (call.name === "bash") {
      commands.push(commandOf(call));
    } else if (FILE_TOOLS.has(call.name)) {
      const file = fileOf(call, files);
      if (file) {
        // A later call replaces what an earlier one saw.
        files.delete(file.path);
        files.set(file.path, file);
      }
    }
  }
  return { commands, files: [...files.values()].reverse() };
}

/**
 * The chat's files with the workspace snapshot merged in: every file the
 * snapshot lists, and for each one the newer of what the chat saw and what the
 * snapshot holds. Newest first.
 */
export function withWorkspace(
  files: readonly FileEntry[],
  snapshot: WorkspaceSnapshot | undefined
): readonly FileEntry[] {
  if (snapshot === undefined) {
    return files;
  }
  const seen = new Map(files.map((file) => [file.path, file]));
  const merged = snapshot.files.map((file): FileEntry => {
    const chat = seen.get(file.path);
    seen.delete(file.path);
    const chatIsNewer =
      chat?.at !== undefined && chat.at > snapshot.takenAt && !chat.stored;
    if (
      chat &&
      (chatIsNewer || file.content === undefined) &&
      chat.content !== undefined &&
      file.skipped === undefined
    ) {
      return { ...chat, size: file.size };
    }
    return {
      how: chat?.how ?? "in workspace",
      partial: false,
      path: file.path,
      size: file.size,
      stored: false,
      ...(file.modifiedAt === undefined ? {} : { at: file.modifiedAt }),
      ...(file.content === undefined ? {} : { content: file.content }),
      ...(file.skipped === undefined ? {} : { skipped: file.skipped }),
    };
  });
  // A file the chat saw after the snapshot isn't in it yet; one it saw before
  // and the snapshot doesn't list was removed.
  const later = [...seen.values()].filter(
    (file) => file.at !== undefined && file.at > snapshot.takenAt
  );
  return [...later, ...merged].sort((a, b) =>
    (b.at ?? "").localeCompare(a.at ?? "")
  );
}
