/**
 * The GitHub side of configuration by pull request: which repository and branch
 * this deployment came from, a short-lived token from the Vercel Connect GitHub
 * connector (`GITHUB_CONNECTOR`, which the Deploy Button sets, or else a GitHub
 * connector attached to the project), and a
 * few REST calls to read files and open a pull request with several of them.
 *
 * The token is the GitHub App's installation token: it never reaches the
 * browser, and the pull request's author is the app. Merging stays with people
 * in GitHub; Vercel deploys the merge as usual.
 *
 * @packageDocumentation
 */

import { getToken } from "@vercel/connect";
import { connectors } from "./connectors";

const API = "https://api.github.com";
const MENTIONS_DRAFT = /draft/iu;
/** Blobs uploaded at once when a change has many files. */
const BLOB_UPLOADS = 8;

/** `fn` over `items`, at most `limit` at a time, in order. */
export async function mapLimit<T, R>(
  items: readonly T[],
  limit: number,
  fn: (item: T) => Promise<R>
): Promise<R[]> {
  const results: R[] = new Array(items.length);
  let next = 0;
  const worker = async () => {
    while (next < items.length) {
      const index = next;
      next += 1;
      // biome-ignore lint/performance/noAwaitInLoops: each worker takes the next item when it's done, to stay within the limit.
      results[index] = await fn(items[index] as T);
    }
  };
  await Promise.all(
    Array.from({ length: Math.min(limit, items.length) }, worker)
  );
  return results;
}
/** Every branch the dashboard opens starts with this, which is also how it finds its pull requests. */
export const BRANCH_PREFIX = "lopsi/";

export interface Repository {
  readonly branch: string;
  readonly owner: string;
  readonly repo: string;
}

/**
 * The repository and branch to propose changes against: Vercel's Git variables
 * for a deployment built from GitHub, or `LOPSI_GITHUB_REPO` (`owner/repo`) and
 * `LOPSI_GITHUB_BRANCH` to override them, as in local development.
 */
export function targetRepository(): Repository | undefined {
  const [overrideOwner, overrideRepo] = (
    process.env.LOPSI_GITHUB_REPO ?? ""
  ).split("/");
  const fromVercel = process.env.VERCEL_GIT_PROVIDER === "github";
  const owner =
    overrideOwner ||
    (fromVercel ? process.env.VERCEL_GIT_REPO_OWNER : undefined);
  const repo =
    overrideRepo || (fromVercel ? process.env.VERCEL_GIT_REPO_SLUG : undefined);
  const branch =
    process.env.LOPSI_GITHUB_BRANCH ||
    (fromVercel ? process.env.VERCEL_GIT_COMMIT_REF : undefined) ||
    "main";
  return owner && repo ? { branch, owner, repo } : undefined;
}

/** The GitHub connector that opens pull requests. */
async function githubConnector(): Promise<string | undefined> {
  return (
    process.env.GITHUB_CONNECTOR?.trim() ||
    (await connectors()).find((connector) => connector.service === "github")?.id
  );
}

/** Why the dashboard can't propose changes here, or `undefined` when it can. */
export async function configChangesUnavailable(): Promise<string | undefined> {
  if ((await githubConnector()) === undefined) {
    return "Attach a GitHub connector to this project in Vercel Connect to let the dashboard open pull requests.";
  }
  if (targetRepository() === undefined) {
    return "This deployment isn't built from a GitHub repository. Set LOPSI_GITHUB_REPO to owner/repo.";
  }
}

export class GitHubError extends Error {
  readonly status: number;
  constructor(message: string, status: number) {
    super(message);
    this.status = status;
  }
}

/**
 * A REST call with the GitHub App's installation token, or with none for
 * `anonymous` reads of a public repository.
 */
async function github<T>(
  path: string,
  init: { anonymous?: boolean; body?: unknown; method?: string } = {}
): Promise<T> {
  let authorization: Record<string, string> = {};
  if (!init.anonymous) {
    const connector = await githubConnector();
    if (!connector) {
      throw new GitHubError("GitHub isn't set up.", 503);
    }
    const token = await getToken(connector, { subject: { type: "app" } });
    authorization = { authorization: `Bearer ${token}` };
  }
  const response = await fetch(`${API}${path}`, {
    body: init.body === undefined ? undefined : JSON.stringify(init.body),
    headers: {
      accept: "application/vnd.github+json",
      ...authorization,
      ...(init.body === undefined
        ? {}
        : { "content-type": "application/json" }),
      "x-github-api-version": "2022-11-28",
    },
    method: init.method ?? "GET",
  });
  if (!response.ok) {
    const detail = (await response.json().catch(() => ({}))) as {
      message?: string;
    };
    throw new GitHubError(
      detail.message ?? `GitHub answered ${response.status}.`,
      response.status
    );
  }
  return (await response.json()) as T;
}

const repoPath = ({ owner, repo }: Pick<Repository, "owner" | "repo">) =>
  `/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}`;

/** The commit the target branch points at now, and its tree. */
async function headOf(
  target: Repository
): Promise<{ commit: string; tree: string }> {
  const ref = await github<{ object: { sha: string } }>(
    `${repoPath(target)}/git/ref/heads/${encodeURIComponent(target.branch)}`
  );
  const commit = await github<{ tree: { sha: string } }>(
    `${repoPath(target)}/git/commits/${ref.object.sha}`
  );
  return { commit: ref.object.sha, tree: commit.tree.sha };
}

/** A snapshot of the target branch: reads files and lists paths at one commit. */
export interface BranchSnapshot {
  readonly commit: string;
  /** Every file path on the branch. */
  readonly paths: ReadonlySet<string>;
  readonly readFile: (path: string) => Promise<string | undefined>;
}

export async function snapshotOf(target: Repository): Promise<BranchSnapshot> {
  const head = await headOf(target);
  const tree = await github<{
    tree: { path: string; type: string }[];
    truncated: boolean;
  }>(`${repoPath(target)}/git/trees/${head.tree}?recursive=1`);
  if (tree.truncated) {
    throw new GitHubError(
      "The repository is too large to read in one request.",
      413
    );
  }
  const paths = new Set(
    tree.tree
      .filter((entry) => entry.type === "blob")
      .map((entry) => entry.path)
  );
  return {
    commit: head.commit,
    paths,
    async readFile(path) {
      if (!paths.has(path)) {
        return;
      }
      const file = await github<{ content: string; encoding: string }>(
        `${repoPath(target)}/contents/${path.split("/").map(encodeURIComponent).join("/")}?ref=${head.commit}`
      );
      return Buffer.from(
        file.content,
        file.encoding === "base64" ? "base64" : "utf8"
      ).toString("utf8");
    },
  };
}

interface GitTree {
  tree: { mode: string; path: string; sha: string; type: string }[];
  truncated: boolean;
}

/** A file in a Git tree: its content hash and mode. */
export interface TreeEntry {
  readonly mode: string;
  readonly sha: string;
}

/** A repository, without the branch. */
export type RepositoryName = Pick<Repository, "owner" | "repo">;

/**
 * Every file at `ref` (a branch, tag or commit), by path. Tries the
 * installation token first and, for a public repository it doesn't cover,
 * reads without one.
 */
export async function treeAt(
  repository: RepositoryName,
  ref: string
): Promise<ReadonlyMap<string, TreeEntry>> {
  const path = `${repoPath(repository)}/git/trees/${encodeURIComponent(ref)}?recursive=1`;
  let tree: GitTree;
  try {
    tree = await github<GitTree>(path);
  } catch (error) {
    if (
      !(error instanceof GitHubError && [401, 403, 404].includes(error.status))
    ) {
      throw error;
    }
    tree = await github<GitTree>(path, { anonymous: true });
  }
  if (tree.truncated) {
    throw new GitHubError(
      "The repository is too large to read in one request.",
      413
    );
  }
  return new Map(
    tree.tree
      .filter((entry) => entry.type === "blob")
      .map((entry) => [entry.path, { mode: entry.mode, sha: entry.sha }])
  );
}

/** The commit the target branch points at now, with every file on it. */
export async function branchTree(target: Repository): Promise<{
  readonly commit: string;
  readonly tree: ReadonlyMap<string, TreeEntry>;
}> {
  const head = await headOf(target);
  return { commit: head.commit, tree: await treeAt(target, head.tree) };
}

/** A file's bytes by its content hash. */
export async function blobOf(
  repository: RepositoryName,
  sha: string
): Promise<Buffer> {
  const blob = await github<{ content: string; encoding: string }>(
    `${repoPath(repository)}/git/blobs/${sha}`
  );
  return Buffer.from(
    blob.content,
    blob.encoding === "base64" ? "base64" : "utf8"
  );
}

export interface PullRequest {
  readonly draft: boolean;
  readonly number: number;
  readonly title: string;
  readonly url: string;
}

/**
 * Commits `files` on a new branch off `base` and opens a pull request for it:
 * a draft where GitHub allows one (private repositories on free plans don't).
 */
export async function openPullRequest(
  target: Repository,
  base: string,
  change: {
    readonly body: string;
    readonly branch: string;
    /**
     * New contents by path: text, or bytes with a file mode (any file, such
     * as an image or an executable script); `null` deletes the file.
     */
    readonly files: Readonly<
      Record<string, string | { content: Buffer; mode: string } | null>
    >;
    readonly title: string;
  }
): Promise<PullRequest> {
  const baseCommit = await github<{ tree: { sha: string } }>(
    `${repoPath(target)}/git/commits/${base}`
  );
  // Bytes go up as blobs first: a tree entry's inline content is UTF-8 only.
  const entries = await mapLimit(
    Object.entries(change.files),
    BLOB_UPLOADS,
    async ([path, content]) => {
      if (content === null) {
        return { mode: "100644", path, sha: null, type: "blob" };
      }
      if (typeof content === "string") {
        return { content, mode: "100644", path, type: "blob" };
      }
      const blob = await github<{ sha: string }>(
        `${repoPath(target)}/git/blobs`,
        {
          body: {
            content: content.content.toString("base64"),
            encoding: "base64",
          },
          method: "POST",
        }
      );
      return { mode: content.mode, path, sha: blob.sha, type: "blob" };
    }
  );
  const tree = await github<{ sha: string }>(`${repoPath(target)}/git/trees`, {
    body: { base_tree: baseCommit.tree.sha, tree: entries },
    method: "POST",
  });
  const commit = await github<{ sha: string }>(
    `${repoPath(target)}/git/commits`,
    {
      body: { message: change.title, parents: [base], tree: tree.sha },
      method: "POST",
    }
  );
  await github(`${repoPath(target)}/git/refs`, {
    body: { ref: `refs/heads/${change.branch}`, sha: commit.sha },
    method: "POST",
  });

  const open = (draft: boolean, body: string) =>
    github<{ draft: boolean; html_url: string; number: number; title: string }>(
      `${repoPath(target)}/pulls`,
      {
        body: {
          base: target.branch,
          body,
          draft,
          head: change.branch,
          title: change.title,
        },
        method: "POST",
      }
    );
  let pull: Awaited<ReturnType<typeof open>>;
  try {
    pull = await open(true, change.body);
  } catch (error) {
    if (
      !(
        error instanceof GitHubError &&
        error.status === 422 &&
        MENTIONS_DRAFT.test(error.message)
      )
    ) {
      throw error;
    }
    pull = await open(
      false,
      `${change.body}\n\n_GitHub doesn't allow draft pull requests in this repository, so this one is ready for review. Review it before merging._`
    );
  }
  return {
    draft: pull.draft,
    number: pull.number,
    title: pull.title,
    url: pull.html_url,
  };
}

/** Open pull requests the dashboard opened (branches under {@link BRANCH_PREFIX}). */
export async function openDashboardPullRequests(
  target: Repository
): Promise<readonly PullRequest[]> {
  const pulls = await github<
    {
      draft: boolean;
      head: { ref: string };
      html_url: string;
      number: number;
      title: string;
    }[]
  >(
    `${repoPath(target)}/pulls?state=open&base=${encodeURIComponent(target.branch)}&per_page=50`
  );
  return pulls
    .filter((pull) => pull.head.ref.startsWith(BRANCH_PREFIX))
    .map((pull) => ({
      draft: pull.draft,
      number: pull.number,
      title: pull.title,
      url: pull.html_url,
    }));
}
