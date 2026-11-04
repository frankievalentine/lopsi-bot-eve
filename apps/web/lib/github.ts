/**
 * The GitHub side of configuration by pull request: which repository and branch
 * this deployment came from, a short-lived token from the Vercel Connect GitHub
 * connector (`GITHUB_CONNECTOR`, set by `pnpm setup:connector github`), and a
 * few REST calls to read files and open a pull request with several of them.
 *
 * The token is the GitHub App's installation token: it never reaches the
 * browser, and the pull request's author is the app. Merging stays with people
 * in GitHub; Vercel deploys the merge as usual.
 *
 * @packageDocumentation
 */

import { getToken } from "@vercel/connect";

const API = "https://api.github.com";
const MENTIONS_DRAFT = /draft/iu;
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

/** Why the dashboard can't propose changes here, or `undefined` when it can. */
export function configChangesUnavailable(): string | undefined {
  if (!process.env.GITHUB_CONNECTOR?.trim()) {
    return "Run `pnpm setup:connector github` to let the dashboard open pull requests.";
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

/** A REST call with the GitHub App's installation token. */
async function github<T>(
  path: string,
  init: { body?: unknown; method?: string } = {}
): Promise<T> {
  const connector = process.env.GITHUB_CONNECTOR?.trim();
  if (!connector) {
    throw new GitHubError("GitHub isn't set up.", 503);
  }
  const token = await getToken(connector, { subject: { type: "app" } });
  const response = await fetch(`${API}${path}`, {
    body: init.body === undefined ? undefined : JSON.stringify(init.body),
    headers: {
      accept: "application/vnd.github+json",
      authorization: `Bearer ${token}`,
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

const repoPath = ({ owner, repo }: Repository) =>
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
    /** New contents by path; `null` deletes the file. */
    readonly files: Readonly<Record<string, string | null>>;
    readonly title: string;
  }
): Promise<PullRequest> {
  const baseCommit = await github<{ tree: { sha: string } }>(
    `${repoPath(target)}/git/commits/${base}`
  );
  const tree = await github<{ sha: string }>(`${repoPath(target)}/git/trees`, {
    body: {
      base_tree: baseCommit.tree.sha,
      tree: Object.entries(change.files).map(([path, content]) =>
        content === null
          ? { mode: "100644", path, sha: null, type: "blob" }
          : { content, mode: "100644", path, type: "blob" }
      ),
    },
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
