/**
 * What a chat's sandbox did, from eve's call observations: the shell commands
 * it ran and the files it wrote or read. eve has no API that lists a sandbox's
 * files, so files the shell created on its own don't appear here.
 *
 * @packageDocumentation
 */

import type { CallObservation, CallState } from "eve/events";

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

/** A file the agent wrote or read, with the latest content the chat saw. */
export interface FileEntry {
  readonly at?: string;
  readonly content?: string;
  readonly how: "read" | "written";
  /** Only part of the file was read. */
  readonly partial: boolean;
  /** Relative to the workspace. */
  readonly path: string;
  /** eve kept the content out of the stream (too large); not shown here. */
  readonly stored: boolean;
}

export interface ComputerActivity {
  readonly commands: readonly CommandRun[];
  /** Newest first. */
  readonly files: readonly FileEntry[];
}

type Json = Record<string, unknown>;

const WORKSPACE = /^\/workspace\/?/u;
const LINE_NUMBER = /^\d+: /u;

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

function fileOf(call: CallObservation): FileEntry | undefined {
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
    } else if (call.name === "write_file" || call.name === "read_file") {
      const file = fileOf(call);
      if (file) {
        // A later call replaces what an earlier one saw.
        files.delete(file.path);
        files.set(file.path, file);
      }
    }
  }
  return { commands, files: [...files.values()].reverse() };
}
