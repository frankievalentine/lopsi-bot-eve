/**
 * Updating a deployment's repository to a newer template release, shared by
 * Settings' Update button (lib/template-update-github.ts, through the GitHub
 * API) and `pnpm update:template` (scripts/update-template.mjs, through git).
 *
 * Git names every file version by its content hash, so the plan compares
 * three trees without reading files: the template at the current release, at
 * the new one, and the repository. A file the template changed is updated
 * only where the repository still has the template's old version; one the
 * person edited is kept and listed. Crew members' shared files (TEMPLATE_PATHS)
 * follow the template member's, each with its own `MEMBER_ID`.
 *
 * Plain JavaScript with no dependencies, so the updater runs from a release
 * tag on a clone that doesn't have it yet.
 *
 * @packageDocumentation
 */

import { createHash } from "node:crypto";

/** The crew member new ones are copied from, and whose shared files every member follows. */
export const TEMPLATE_MEMBER = "lopsi";

/**
 * What every crew member has a copy of from the template member: its web and
 * email channels (access modes, the chat owner check), connections, hooks (the
 * chat list), tools, session budget, memory and sandbox. A provider channel
 * (Slack, Telegram) belongs to the one member set up to answer it.
 */
export const TEMPLATE_PATHS = [
  "agent/channels/eve.ts",
  "agent/channels/resend.ts",
  "agent/connections/",
  "agent/hooks/",
  "agent/tools/",
  "agent/limits.ts",
  "agent/memory.ts",
  "agent/sandbox.ts",
];

/** Generated from every crew.json; rebuilt, never copied. */
export const GENERATED = "apps/web/lib/crew.generated.ts";

/** The template's repository and the version this repository is on. */
export const TEMPLATE_FILE = "apps/web/lib/template.json";

const MEMBER_ID_LINE = `const MEMBER_ID = "${TEMPLATE_MEMBER}";`;
const MEMBER_PATH = /^agents\/(?<member>[^/]+)\/(?<rest>.+)$/u;
const AGENT_DIR = /^agents\/(?<member>[^/]+)\/agent\//u;
const CREW_JSON = /^agents\/[^/]+\/crew\.json$/u;
/** Regular and executable files; symlinks and submodules are left alone. */
const FILE_MODES = new Set(["100644", "100755"]);

/**
 * A template file's content for crew member `id`: a file declaring its
 * member's id gets `id`'s. `undefined` when it doesn't declare one.
 *
 * @param {string} content
 * @param {string} id
 * @returns {string | undefined}
 */
export function rewriteMemberId(content, id) {
  return content.includes(MEMBER_ID_LINE)
    ? content.replace(MEMBER_ID_LINE, `const MEMBER_ID = "${id}";`)
    : undefined;
}

/**
 * Git's name for a file's content.
 *
 * @param {Buffer | string} content
 * @returns {string}
 */
export function blobSha(content) {
  const bytes = typeof content === "string" ? Buffer.from(content) : content;
  return createHash("sha1")
    .update(`blob ${bytes.length}\0`)
    .update(bytes)
    .digest("hex");
}

/**
 * @typedef {{ readonly mode: string, readonly sha: string }} Entry
 * @typedef {ReadonlyMap<string, Entry>} Tree
 * @typedef {(path: string) => Promise<Buffer | undefined>} Reader
 *
 * @typedef {{ readonly delete: true, readonly path: string }} Deletion
 * @typedef {{
 *   readonly delete?: false,
 *   readonly memberId?: string,
 *   readonly mode: string,
 *   readonly path: string,
 *   readonly source: string,
 * }} Copy A template file at `source` written to `path`, for `memberId` when set.
 * @typedef {{ readonly content: string, readonly delete?: false, readonly mode: string, readonly path: string }} Written
 * @typedef {Deletion | Copy | Written} Change
 *
 * @typedef {"edited" | "unsupported"} KeptReason
 * @typedef {{ readonly path: string, readonly reason: KeptReason, readonly source: string }} Kept
 *
 * @typedef {{
 *   readonly changes: readonly Change[],
 *   readonly crewChanged: boolean,
 *   readonly kept: readonly Kept[],
 * }} Plan
 */

/**
 * @param {Tree} tree
 * @returns {Set<string>}
 */
function membersOf(tree) {
  const members = new Set();
  for (const path of tree.keys()) {
    const member = AGENT_DIR.exec(path)?.groups?.member;
    if (member) {
      members.add(member);
    }
  }
  return members;
}

/**
 * Where a template file goes in the repository: shared crew files to every
 * member, the template member's own files to it (if it's still there), and
 * everything else to the same path. Each target carries the member whose id
 * its content takes.
 *
 * @param {string} path
 * @param {ReadonlySet<string>} members
 * @returns {{ memberId?: string, path: string }[]}
 */
function targetsOf(path, members) {
  const match = MEMBER_PATH.exec(path)?.groups;
  if (match?.member !== TEMPLATE_MEMBER || match.rest === undefined) {
    return [{ path }];
  }
  const { rest } = match;
  if (TEMPLATE_PATHS.some((prefix) => rest.startsWith(prefix))) {
    return [...members].map((member) => ({
      memberId: member,
      path: `agents/${member}/${rest}`,
    }));
  }
  return members.has(TEMPLATE_MEMBER) ? [{ path }] : [];
}

/**
 * The hash a member's copy of a template file would have: the file's own, or,
 * for a file that declares its member's id, the hash with `memberId`'s.
 *
 * @param {Entry | undefined} entry
 * @param {string} source
 * @param {Reader} read
 * @param {string | undefined} memberId
 * @returns {Promise<string | undefined>}
 */
async function expectedSha(entry, source, read, memberId) {
  if (entry === undefined || !memberId || memberId === TEMPLATE_MEMBER) {
    return entry?.sha;
  }
  const content = await read(source);
  const rewritten =
    content === undefined
      ? undefined
      : rewriteMemberId(content.toString("utf8"), memberId);
  return rewritten === undefined ? entry.sha : blobSha(rewritten);
}

/**
 * What happens to one file in the repository when the template's `source`
 * changed from `before` to `after`: nothing (it already matches), updated or
 * deleted (it still matches the old one), or kept (it was edited).
 *
 * @param {{
 *   readonly after: Entry | undefined,
 *   readonly before: Entry | undefined,
 *   readonly mine: Tree,
 *   readonly readNew: Reader,
 *   readonly readOld: Reader,
 *   readonly source: string,
 *   readonly target: { memberId?: string, path: string },
 * }} input
 * @returns {Promise<Change | Kept | undefined>}
 */
async function planTarget({
  after,
  before,
  mine,
  readNew,
  readOld,
  source,
  target,
}) {
  const current = mine.get(target.path)?.sha;
  const [old, next] = await Promise.all([
    expectedSha(before, source, readOld, target.memberId),
    expectedSha(after, source, readNew, target.memberId),
  ]);
  if (current === next) {
    return;
  }
  if (current !== old) {
    return { path: target.path, reason: "edited", source };
  }
  if (after === undefined) {
    return { delete: true, path: target.path };
  }
  return {
    mode: after.mode,
    path: target.path,
    source,
    ...(target.memberId && target.memberId !== TEMPLATE_MEMBER
      ? { memberId: target.memberId }
      : {}),
  };
}

/**
 * The plan for updating `mine` from the template's `oldTree` to its `newTree`.
 * Reads a file only to give a crew member's copy its own id.
 *
 * @param {{
 *   readonly mine: Tree,
 *   readonly newTree: Tree,
 *   readonly oldTree: Tree,
 *   readonly readMine: Reader,
 *   readonly readNew: Reader,
 *   readonly readOld: Reader,
 * }} input
 * @returns {Promise<Plan>}
 */
export async function planUpdate({
  mine,
  newTree,
  oldTree,
  readMine,
  readNew,
  readOld,
}) {
  const members = membersOf(mine);
  const paths = [...new Set([...oldTree.keys(), ...newTree.keys()])].sort();
  // Each path is planned on its own; Promise.all keeps their order.
  const planned = await Promise.all(
    paths.map(async (source) => {
      const before = oldTree.get(source);
      const after = newTree.get(source);
      if (before?.sha === after?.sha || source === GENERATED) {
        return [];
      }
      if (source === TEMPLATE_FILE) {
        const written = await templateFile(mine, readMine, readNew);
        return written ? [written] : [];
      }
      if (after !== undefined && !FILE_MODES.has(after.mode)) {
        return [{ path: source, reason: "unsupported", source }];
      }
      return Promise.all(
        targetsOf(source, members).map((target) =>
          planTarget({ after, before, mine, readNew, readOld, source, target })
        )
      );
    })
  );
  /** @type {(Change | Kept | undefined)[]} */
  const outcomes = planned.flat();
  /** @type {Change[]} */
  const changes = [];
  /** @type {Kept[]} */
  const kept = [];
  for (const outcome of outcomes) {
    if (outcome === undefined) {
      continue;
    }
    if ("reason" in outcome) {
      kept.push(outcome);
    } else {
      changes.push(outcome);
    }
  }
  return {
    changes,
    crewChanged: changes.some((change) => CREW_JSON.test(change.path)),
    kept,
  };
}

/**
 * template.json with the new release's version, keeping the repository it
 * points at, so an update always records the version it brought.
 *
 * @param {Tree} mine
 * @param {Reader} readMine
 * @param {Reader} readNew
 * @returns {Promise<Written | undefined>}
 */
async function templateFile(mine, readMine, readNew) {
  const next = await readNew(TEMPLATE_FILE);
  if (next === undefined) {
    return;
  }
  const { version } = JSON.parse(next.toString("utf8"));
  const current = mine.has(TEMPLATE_FILE)
    ? await readMine(TEMPLATE_FILE)
    : undefined;
  const base = current ? JSON.parse(current.toString("utf8")) : {};
  const content = `${JSON.stringify({ ...JSON.parse(next.toString("utf8")), ...base, version }, null, 2)}\n`;
  return { content, mode: "100644", path: TEMPLATE_FILE };
}

/**
 * The bytes to write for a change.
 *
 * @param {Copy | Written} change
 * @param {Reader} readNew
 * @returns {Promise<Buffer>}
 */
export async function contentOf(change, readNew) {
  if ("content" in change) {
    return Buffer.from(change.content);
  }
  const content = await readNew(change.source);
  if (content === undefined) {
    throw new Error(`The template has no ${change.source}.`);
  }
  if (change.memberId === undefined) {
    return content;
  }
  const rewritten = rewriteMemberId(content.toString("utf8"), change.memberId);
  return rewritten === undefined ? content : Buffer.from(rewritten);
}

/**
 * The template's change to one file between two releases, on GitHub.
 *
 * @param {string} repository `owner/name`
 * @param {string} from
 * @param {string} to
 * @param {string} path
 */
export function changeLink(repository, from, to, path) {
  const anchor = createHash("sha256").update(path).digest("hex");
  return `https://github.com/${repository}/compare/v${from}...v${to}#diff-${anchor}`;
}

/** Files the GitHub App can't change without a permission most installs don't grant. */
export const WORKFLOWS = ".github/workflows/";

/**
 * What an update did and what it left, as Markdown: the pull request's
 * description, and what `pnpm update:template` prints.
 *
 * @param {Plan} plan
 * @param {{
 *   readonly from: string,
 *   readonly repository: string,
 *   readonly skipped?: readonly Kept[],
 *   readonly to: string,
 * }} options `skipped`: files left for another reason, such as workflows.
 * @returns {string}
 */
export function describePlan(plan, { from, repository, skipped = [], to }) {
  const link = (/** @type {Kept} */ entry) =>
    `- \`${entry.path}\`: [the template's change](${changeLink(repository, from, to, entry.source)})`;
  const edited = plan.kept.filter((entry) => entry.reason === "edited");
  const unsupported = plan.kept.filter(
    (entry) => entry.reason === "unsupported"
  );
  const touched = new Set([
    ...plan.changes.map((change) => change.path),
    ...plan.kept.map((entry) => entry.path),
  ]);
  const lines = [
    `Updates this repository from the template's v${from} to v${to} (${repository}).`,
    "",
    `Read the [release notes](https://github.com/${repository}/releases) for every version since v${from}: they say when an update needs a new environment variable or a setup step, which this can't do for you.`,
    "",
    `Updated ${plan.changes.length} file${plan.changes.length === 1 ? "" : "s"}: those you hadn't changed since v${from}.`,
  ];
  if (edited.length > 0) {
    lines.push(
      "",
      "**Kept as you have them.** You've changed these since the template's version, so they weren't replaced. Apply the template's change by hand where it matters:",
      ...edited.map(link)
    );
  }
  if (skipped.length > 0) {
    lines.push(
      "",
      "**Not changed here.** The dashboard's GitHub App can't change GitHub Actions workflows. Apply these by hand:",
      ...skipped.map(link)
    );
  }
  if (unsupported.length > 0) {
    lines.push(
      "",
      "**Not changed:** symlinks and submodules.",
      ...unsupported.map(link)
    );
  }
  const notes = [];
  if (touched.has("package.json") || touched.has("pnpm-lock.yaml")) {
    notes.push(
      touched.has("pnpm-lock.yaml") &&
        plan.kept.some((entry) => entry.path === "pnpm-lock.yaml")
        ? "Dependencies changed and your `pnpm-lock.yaml` was kept: run `pnpm install` on this branch and commit the lockfile, or the deployment won't build."
        : "Dependencies changed: run `pnpm install` after you pull this."
    );
  }
  if (plan.kept.some((entry) => entry.path.startsWith("agents/"))) {
    notes.push(
      "Some crew member files were kept because they differ from the template member's: check each against the template's change."
    );
  }
  if (notes.length > 0) {
    lines.push("", ...notes.map((note) => `- ${note}`));
  }
  return lines.join("\n");
}
