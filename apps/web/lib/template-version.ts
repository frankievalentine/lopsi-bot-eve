/**
 * Which version of the template this is, and whether a newer one is out, from
 * the template repository's GitHub releases. A release named with "Security"
 * marks an update as one not to put off.
 *
 * @packageDocumentation
 */

import template from "./template.json" with { type: "json" };

const VERSION = /^v?(?<major>\d+)\.(?<minor>\d+)\.(?<patch>\d+)$/u;
const SECURITY = /\bsecurity\b/iu;
const LEADING_V = /^v/u;
const CHECK_TIMEOUT_MS = 3000;
const CHECK_EVERY_SECONDS = 3600;

export const TEMPLATE_VERSION = template.version;

interface Release {
  readonly draft?: boolean;
  readonly html_url: string;
  readonly name?: string | null;
  readonly prerelease?: boolean;
  readonly tag_name: string;
}

export interface TemplateUpdate {
  /** Whether any release since this version is a security fix. */
  readonly security: boolean;
  readonly url: string;
  readonly version: string;
}

function parts(version: string): readonly number[] | undefined {
  const groups = VERSION.exec(version)?.groups;
  return groups
    ? [Number(groups.major), Number(groups.minor), Number(groups.patch)]
    : undefined;
}

function isNewer(a: readonly number[], b: readonly number[]): boolean {
  const at = a.findIndex((value, index) => value !== b[index]);
  return at !== -1 && (a[at] ?? 0) > (b[at] ?? 0);
}

/** The newest published release after `current`, if there is one. */
export function availableUpdate(
  releases: readonly Release[],
  current: string
): TemplateUpdate | undefined {
  const base = parts(current);
  if (base === undefined) {
    return;
  }
  const newer = releases.flatMap((release) => {
    const version = parts(release.tag_name);
    return version &&
      !release.draft &&
      !release.prerelease &&
      isNewer(version, base)
      ? [{ release, version }]
      : [];
  });
  const [first, ...rest] = newer;
  if (first === undefined) {
    return;
  }
  const newest = rest.reduce(
    (latest, entry) =>
      isNewer(entry.version, latest.version) ? entry : latest,
    first
  );
  return {
    security: newer.some((entry) => SECURITY.test(entry.release.name ?? "")),
    url: newest.release.html_url,
    version: newest.release.tag_name.replace(LEADING_V, ""),
  };
}

/**
 * Asks GitHub for a newer release, at most hourly. Settings still works without
 * an answer, so a failure is the same as no update.
 */
export async function checkForUpdate(
  send: typeof fetch = fetch
): Promise<TemplateUpdate | undefined> {
  try {
    const response = await send(
      `https://api.github.com/repos/${template.repository}/releases?per_page=30`,
      {
        headers: { Accept: "application/vnd.github+json" },
        next: { revalidate: CHECK_EVERY_SECONDS },
        signal: AbortSignal.timeout(CHECK_TIMEOUT_MS),
      }
    );
    return response.ok
      ? availableUpdate((await response.json()) as Release[], TEMPLATE_VERSION)
      : undefined;
  } catch {
    return undefined;
  }
}
