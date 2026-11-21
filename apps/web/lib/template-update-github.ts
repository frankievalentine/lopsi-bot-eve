/**
 * Settings' Update button: plans a template update for the deployment's
 * repository (template-update.mjs) from the GitHub API, and turns it into the
 * files of one pull request. The template's two release trees are read through
 * the API; its files, from raw.githubusercontent.com, which a public
 * repository serves without the API's rate limit.
 *
 * GitHub Actions workflows are left out: the dashboard's GitHub App can't
 * change them without the `workflows` permission, so they're listed instead.
 *
 * @packageDocumentation
 */

import { ConfigConflictError } from "./config-changes";
import { crewSource, parseCrewJson } from "./crew-core.mjs";
import {
  blobOf,
  branchTree,
  mapLimit,
  type Repository,
  type RepositoryName,
  type TreeEntry,
  treeAt,
} from "./github";
import {
  contentOf,
  describePlan,
  GENERATED,
  planUpdate,
  TEMPLATE_FILE,
  WORKFLOWS,
} from "./template-update.mjs";

/** Template files fetched at once. */
const DOWNLOADS = 8;
const VERSION = /^\d+\.\d+\.\d+$/u;

/** An update as a pull request's files and description. */
export interface UpdateChange {
  /** The branch commit it was planned against. */
  readonly base: string;
  readonly body: string;
  readonly files: Readonly<
    Record<string, { content: Buffer; mode: string } | null>
  >;
  /** Files left for a person: edited here, or workflows. */
  readonly left: number;
}

function nameOf(repository: string): RepositoryName {
  const [owner = "", repo = ""] = repository.split("/");
  return { owner, repo };
}

/** Reads files of one tree, once each. */
function reader(
  tree: ReadonlyMap<string, TreeEntry>,
  read: (path: string, entry: TreeEntry) => Promise<Buffer>
) {
  const cache = new Map<string, Promise<Buffer>>();
  return (path: string): Promise<Buffer | undefined> => {
    const entry = tree.get(path);
    if (entry === undefined) {
      return Promise.resolve(undefined);
    }
    let content = cache.get(entry.sha);
    if (content === undefined) {
      content = read(path, entry);
      cache.set(entry.sha, content);
    }
    return content;
  };
}

/** A public repository's file at a tag. */
async function rawFile(
  repository: string,
  tag: string,
  path: string
): Promise<Buffer> {
  const url = `https://raw.githubusercontent.com/${repository}/${encodeURIComponent(tag)}/${path
    .split("/")
    .map(encodeURIComponent)
    .join("/")}`;
  const response = await fetch(url, { cache: "no-store" });
  if (!response.ok) {
    throw new Error(
      `GitHub answered ${response.status} for ${path} at ${tag}.`
    );
  }
  return Buffer.from(await response.arrayBuffer());
}

/** The version the branch is on, from its template.json. */
async function branchVersion(
  read: (path: string) => Promise<Buffer | undefined>
): Promise<string | undefined> {
  const file = await read(TEMPLATE_FILE);
  if (file === undefined) {
    return;
  }
  const { version } = JSON.parse(file.toString("utf8")) as {
    version?: unknown;
  };
  return typeof version === "string" && VERSION.test(version)
    ? version
    : undefined;
}

/**
 * The pull request that updates `target` to template release `to`: files the
 * branch hasn't changed since its own release are updated, the rest listed.
 */
export async function updateChange(
  target: Repository,
  repository: string,
  to: string
): Promise<UpdateChange & { readonly from: string }> {
  const template = nameOf(repository);
  const branch = await branchTree(target);
  const readMine = reader(branch.tree, (_path, entry) =>
    blobOf(target, entry.sha)
  );
  const from = await branchVersion(readMine);
  if (from === undefined) {
    throw new ConfigConflictError(
      `${TEMPLATE_FILE} on ${target.branch} has no version, so the dashboard can't tell which release to update from. Use \`pnpm update:template ${to} --from <version>\`.`
    );
  }
  const [oldTree, newTree] = await Promise.all([
    treeAt(template, `v${from}`),
    treeAt(template, `v${to}`),
  ]);
  const readOld = reader(oldTree, (path) =>
    rawFile(repository, `v${from}`, path)
  );
  const readNew = reader(newTree, (path) =>
    rawFile(repository, `v${to}`, path)
  );
  const plan = await planUpdate({
    mine: branch.tree,
    newTree,
    oldTree,
    readMine,
    readNew,
    readOld,
  });

  const workflows = plan.changes.filter((change) =>
    change.path.startsWith(WORKFLOWS)
  );
  const applied = plan.changes.filter(
    (change) => !change.path.startsWith(WORKFLOWS)
  );
  const written = await mapLimit(applied, DOWNLOADS, async (change) =>
    change.delete
      ? ([change.path, null] as const)
      : ([
          change.path,
          { content: await contentOf(change, readNew), mode: change.mode },
        ] as const)
  );
  const body = describePlan(
    { ...plan, changes: applied },
    {
      from,
      repository,
      skipped: workflows.map((change) => ({
        path: change.path,
        reason: "edited" as const,
        source: "source" in change ? change.source : change.path,
      })),
      to,
    }
  );
  const files: Record<string, { content: Buffer; mode: string } | null> =
    Object.fromEntries(written);
  if (plan.crewChanged) {
    files[GENERATED] = {
      content: Buffer.from(await crewList(branch.tree, files, readMine)),
      mode: "100644",
    };
  }
  return {
    base: branch.commit,
    body,
    files,
    from,
    left: plan.kept.length + workflows.length,
  };
}

const MEMBER_DIR = /^agents\/(?<id>[^/]+)\/agent\//u;

/** crew.generated.ts for the branch with the update's crew.json files. */
async function crewList(
  tree: ReadonlyMap<string, TreeEntry>,
  files: Readonly<Record<string, { content: Buffer } | null>>,
  readMine: (path: string) => Promise<Buffer | undefined>
): Promise<string> {
  const ids = new Set(
    [...tree.keys()].flatMap((path) => {
      const id = MEMBER_DIR.exec(path)?.groups?.id;
      return id ? [id] : [];
    })
  );
  const entries = await Promise.all(
    [...ids].map(async (id) => {
      const path = `agents/${id}/crew.json`;
      const updated = files[path];
      const text =
        updated === undefined
          ? (await readMine(path))?.toString("utf8")
          : updated?.content.toString("utf8");
      const parsed = text === undefined ? undefined : parseCrewJson(text);
      return { data: parsed?.ok ? parsed.data : undefined, id };
    })
  );
  return crewSource(entries);
}
