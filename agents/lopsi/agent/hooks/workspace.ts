import { calls } from "eve/events";
import { defineHook } from "eve/hooks";
import { isProductionMode } from "../../../../apps/web/lib/production-mode.js";
import {
  saveWorkspace,
  type WorkspaceFile,
} from "../../../../apps/web/lib/workspace-store.js";

const WORKSPACE = "/workspace";
/** Tools that change the workspace; a turn without them leaves the sandbox asleep. */
const CHANGES_FILES = new Set(["bash", "write_file"]);
const MAX_FILES = 500;
const MAX_FILE_BYTES = 128 * 1024;
const MAX_TOTAL_BYTES = 1.5 * 1024 * 1024;

// Size, modified time and path of each file, NUL-separated. eve's own files
// (.eve/), dependencies and git internals aren't the work.
const LIST = [
  `cd ${WORKSPACE}`,
  "find . -type f -not -path './.eve/*' -not -path '*/node_modules/*' -not -path '*/.git/*'",
  String.raw`-printf '%s\t%T@\t%P\0'`,
  `| head -z -n ${MAX_FILES + 1}`,
].join(" ");

interface Listed {
  readonly modifiedAt?: string;
  readonly path: string;
  readonly size: number;
}

function parseListing(stdout: string): Listed[] {
  return stdout
    .split("\0")
    .filter(Boolean)
    .flatMap((entry) => {
      const [size, modified, ...rest] = entry.split("\t");
      const path = rest.join("\t");
      const seconds = Number(modified);
      return path
        ? [
            {
              path,
              size: Number(size) || 0,
              ...(Number.isFinite(seconds)
                ? { modifiedAt: new Date(seconds * 1000).toISOString() }
                : {}),
            },
          ]
        : [];
    });
}

/** Which files to read: small enough, in listing order, until the total budget runs out. */
function withinBudget(
  listed: readonly Listed[]
): { file: Listed; read: boolean }[] {
  let total = 0;
  return listed.map((file) => {
    const read =
      file.size <= MAX_FILE_BYTES && total + file.size <= MAX_TOTAL_BYTES;
    if (read) {
      total += file.size;
    }
    return { file, read };
  });
}

/**
 * Snapshots the chat's workspace after a turn that used the shell or wrote a
 * file, for the computer panel (apps/web/lib/workspace-store.ts), so it shows
 * files the shell made too. Production mode only; a failure never fails the
 * turn.
 */
export default defineHook({
  events: {
    async "turn.settled"(event, ctx) {
      if (
        !isProductionMode() ||
        ctx.session.auth.initiator?.principalType !== "user" ||
        !calls(ctx.view, { kind: "tool", turnId: event.data.turnId }).some(
          (call) => CHANGES_FILES.has(call.name)
        )
      ) {
        return;
      }
      try {
        const sandbox = await ctx.getSandbox();
        const listing = await sandbox.run({ command: LIST });
        if (listing.exitCode !== 0) {
          return;
        }
        const listed = parseListing(listing.stdout);
        const files = await Promise.all(
          withinBudget(listed.slice(0, MAX_FILES)).map(
            async ({ file, read }): Promise<WorkspaceFile | undefined> => {
              if (!read) {
                return { ...file, skipped: "large" };
              }
              const content = await sandbox.readTextFile({
                path: `${WORKSPACE}/${file.path}`,
              });
              if (content === null) {
                return;
              }
              return content.includes("\0")
                ? { ...file, skipped: "binary" }
                : { ...file, content };
            }
          )
        );
        await saveWorkspace(ctx.session.id, {
          files: files.filter((file) => file !== undefined),
          partial: listed.length > MAX_FILES,
          takenAt: new Date().toISOString(),
        });
      } catch (error) {
        console.error("[lopsi] couldn't snapshot the workspace:", error);
      }
    },
  },
});
