#!/usr/bin/env node
/**
 * Updates this repository to a newer template release on a new branch, the
 * same way Settings' Update button does (apps/web/lib/template-update.mjs):
 * files you haven't changed since your release are updated; files you have are
 * kept and listed, with a link to the template's change.
 *
 * Run it from the repository's root with a clean working tree. It fetches the
 * two release tags into refs/lopsi-template/, writes the changes on a branch
 * named update-template-v<version>, stages them, and prints what it left.
 *
 * Usage: pnpm update:template <version> [--from <version>] [--repo owner/name]
 */

import { execFileSync } from "node:child_process";
import {
  chmodSync,
  existsSync,
  mkdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { dirname } from "node:path";
import {
  contentOf,
  describePlan,
  planUpdate,
  TEMPLATE_FILE,
} from "../apps/web/lib/template-update.mjs";

const VERSION = /^v?(?<version>\d+\.\d+\.\d+)$/u;
const REPOSITORY = /^[\w.-]+\/[\w.-]+$/u;
const TREE_LINE =
  /^(?<mode>\d+) (?<type>\w+) (?<sha>[0-9a-f]+)\t(?<path>.+)$/su;
const MAX_BUFFER = 256 * 1024 * 1024;

/**
 * @param {string} message
 * @returns {never}
 */
function fail(message) {
  console.error(`update-template: ${message}`);
  process.exit(1);
}

/**
 * @param {readonly string[]} args
 * @returns {Buffer}
 */
function git(args) {
  return execFileSync("git", args, {
    maxBuffer: MAX_BUFFER,
    stdio: ["ignore", "pipe", "pipe"],
  });
}

/** @param {string | undefined} value */
function versionOf(value) {
  return VERSION.exec(value ?? "")?.groups?.version;
}

/**
 * The versions and template repository to update between, from the command
 * line and template.json.
 *
 * @param {readonly string[]} argv
 */
function settings(argv) {
  /** @type {Record<string, string>} */
  const options = {};
  const positional = [];
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index] ?? "";
    if (arg === "--from" || arg === "--repo") {
      options[arg.slice(2)] = argv[index + 1] ?? "";
      index += 1;
    } else {
      positional.push(arg);
    }
  }
  const to = versionOf(positional[0]);
  if (to === undefined) {
    fail("give the version to update to, such as 0.2.0.");
  }
  if (!existsSync(TEMPLATE_FILE)) {
    fail(`run this from your repository's root (no ${TEMPLATE_FILE} here).`);
  }
  const template = JSON.parse(readFileSync(TEMPLATE_FILE, "utf8"));
  const from = versionOf(options.from ?? template.version);
  if (from === undefined) {
    fail(`${TEMPLATE_FILE} has no version; pass --from <version>.`);
  }
  const repository =
    options.repo ||
    process.env.LOPSI_TEMPLATE_REPOSITORY ||
    template.repository;
  if (!REPOSITORY.test(repository ?? "")) {
    fail("pass the template repository as --repo owner/name.");
  }
  return { from, repository, to };
}

/**
 * Every file at `ref`, by path.
 *
 * @param {string} ref
 */
function treeAt(ref) {
  const entries = new Map();
  const listing = git(["ls-tree", "-r", "-z", ref]).toString("utf8");
  for (const line of listing.split("\0")) {
    const groups = TREE_LINE.exec(line)?.groups;
    if (groups?.type === "blob") {
      entries.set(groups.path, { mode: groups.mode, sha: groups.sha });
    }
  }
  return entries;
}

/**
 * Reads files of one tree, once each.
 *
 * @param {ReadonlyMap<string, { sha: string }>} tree
 * @returns {(path: string) => Promise<Buffer | undefined>}
 */
function readerOf(tree) {
  const cache = new Map();
  return (path) => {
    const entry = tree.get(path);
    if (entry === undefined) {
      return Promise.resolve(undefined);
    }
    if (!cache.has(entry.sha)) {
      cache.set(entry.sha, git(["cat-file", "blob", entry.sha]));
    }
    return Promise.resolve(cache.get(entry.sha));
  };
}

/**
 * Fetches the two release tags into refs/lopsi-template/, not refs/tags, so
 * they don't mix with your own tags.
 *
 * @param {{ from: string, repository: string, to: string }} update
 */
function fetchReleases({ from, repository, to }) {
  const refs = {
    from: `refs/lopsi-template/v${from}`,
    to: `refs/lopsi-template/v${to}`,
  };
  console.log(`Fetching v${from} and v${to} from ${repository}…`);
  try {
    git([
      "fetch",
      "--no-tags",
      "--force",
      `https://github.com/${repository}.git`,
      `refs/tags/v${from}:${refs.from}`,
      `refs/tags/v${to}:${refs.to}`,
    ]);
  } catch (error) {
    const detail = /** @type {{ stderr?: Buffer }} */ (error).stderr;
    fail(
      `couldn't fetch v${from} and v${to} from ${repository}: ${String(detail ?? error).trim()}`
    );
  }
  return refs;
}

/**
 * Writes the plan's changes to the working tree.
 *
 * @param {import("../apps/web/lib/template-update.mjs").Plan} plan
 * @param {(path: string) => Promise<Buffer | undefined>} readNew
 */
async function apply(plan, readNew) {
  const contents = await Promise.all(
    plan.changes.map((change) =>
      change.delete ? undefined : contentOf(change, readNew)
    )
  );
  plan.changes.forEach((change, index) => {
    const content = contents[index];
    if (change.delete || content === undefined) {
      rmSync(change.path, { force: true });
      return;
    }
    mkdirSync(dirname(change.path), { recursive: true });
    writeFileSync(change.path, content);
    chmodSync(change.path, change.mode === "100755" ? 0o755 : 0o644);
  });
  if (plan.crewChanged && existsSync("scripts/crew.mjs")) {
    try {
      execFileSync(process.execPath, ["scripts/crew.mjs"], {
        stdio: "inherit",
      });
    } catch {
      console.warn(
        "Couldn't regenerate the crew list; run `pnpm crew` before you commit."
      );
    }
  }
}

async function main() {
  const update = settings(process.argv.slice(2));
  if (update.from === update.to) {
    console.log(`Already on v${update.to}.`);
    return;
  }
  if (git(["status", "--porcelain"]).length > 0) {
    fail("commit or stash your changes first; the working tree isn't clean.");
  }
  const refs = fetchReleases(update);
  const oldTree = treeAt(refs.from);
  const newTree = treeAt(refs.to);
  const mine = treeAt("HEAD");
  const readNew = readerOf(newTree);
  const plan = await planUpdate({
    mine,
    newTree,
    oldTree,
    readMine: readerOf(mine),
    readNew,
    readOld: readerOf(oldTree),
  });

  const branch = `update-template-v${update.to}`;
  try {
    git(["switch", "-c", branch]);
  } catch {
    fail(
      `couldn't create the branch ${branch}; delete it or switch to it and start over.`
    );
  }
  await apply(plan, readNew);
  git(["add", "--all"]);

  console.log("");
  console.log(describePlan(plan, update));
  console.log("");
  console.log(`The changes are staged on ${branch}. Next:`);
  console.log("  pnpm install    # if package.json changed");
  console.log("  pnpm validate");
  console.log(
    `  git commit -m "Update the template to v${update.to}", push, and open a pull request`
  );
}

await main();
