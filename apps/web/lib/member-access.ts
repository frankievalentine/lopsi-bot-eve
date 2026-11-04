/**
 * What a crew member may use, in the files the dashboard edits by pull
 * request: built-in tools (agent/tools/bash.ts, web_search.ts, web_fetch.ts)
 * and the sandbox's network (agent/sandbox.ts). Each file is written from a
 * template here and read back only when it still matches that template byte
 * for byte, so a file edited by hand is shown, not rewritten.
 *
 * The written files match Biome's formatting, so the dashboard's pull
 * requests pass `pnpm check`.
 *
 * @packageDocumentation
 */

/** A built-in tool that can be turned off: present (eve's default) or `disableTool()`. */
export type ToolSwitch = "on" | "off";

/** web_fetch: off, or on and asking before every URL or once per chat. `never` (no file) isn't written, only read. */
export type WebFetchMode = "off" | "always" | "once" | "never";

export interface MemberAccess {
  readonly bash?: ToolSwitch;
  /** Domains the shell may reach on Vercel; empty is no network. */
  readonly sandboxDomains?: readonly string[];
  readonly webFetch?: WebFetchMode;
  readonly webSearch?: ToolSwitch;
}

/** The files these settings live in, relative to `agents/<id>/agent/`. */
export const ACCESS_FILES = {
  bash: "tools/bash.ts",
  sandbox: "sandbox.ts",
  webFetch: "tools/web_fetch.ts",
  webSearch: "tools/web_search.ts",
} as const;

const LINE_WIDTH = 80;
const MAX_DOMAINS = 20;
const HOSTNAME =
  /^(?=.{1,253}$)(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,63}$/u;

const DISABLED_TOOL = `import { disableTool } from "eve/tools";

export default disableTool();
`;

const WEB_FETCH_DOC = {
  always: `/**
 * eve's web_fetch, asking first. It runs in the app, outside the sandbox's
 * network policy, so a URL built from chat or connector data could carry that
 * data away; the person sees each URL before it's fetched.
 */`,
  once: `/**
 * eve's web_fetch, asking once per chat: after the first approval, later
 * fetches in that chat run without asking. It runs in the app, outside the
 * sandbox's network policy, so a URL built from chat or connector data could
 * carry that data away unseen once approved.
 */`,
} as const;

function webFetchSource(request: "always" | "once"): string {
  return `import { defineTool } from "eve/tools";
import { ${request} } from "eve/tools/approval";
import { webFetch } from "eve/tools/web_fetch";

${WEB_FETCH_DOC[request]}
export default defineTool({
  ...webFetch,
  approval: {
    prompt: ({ input }) => \`Fetch \${input.url}?\`,
    request: ${request}(),
  },
});
`;
}

function domainsLine(domains: readonly string[]): string {
  const inline = `const ALLOWED_DOMAINS: readonly string[] = [${domains.map((domain) => `"${domain}"`).join(", ")}];`;
  return inline.length <= LINE_WIDTH
    ? inline
    : `const ALLOWED_DOMAINS: readonly string[] = [\n${domains.map((domain) => `  "${domain}",\n`).join("")}];`;
}

function sandboxSource(domains: readonly string[]): string {
  return `import { DefaultSandbox, defineSandbox } from "eve/sandbox";

/**
 * Domains the shell may reach on Vercel; empty means no network. Edited from
 * the dashboard (a crew member's Edit), which keeps this file's shape.
 */
${domainsLine(domains)}

/**
 * Each chat's sandbox. On Vercel it reaches only ALLOWED_DOMAINS, so nothing
 * the crew reads (a page, a connector's data) can make \`bash\` send it
 * anywhere else; web pages come through web_fetch, which asks first. Locally
 * eve uses just-bash, which can't restrict the network.
 */
export const environment = DefaultSandbox.environment({
  // Captured in the build's snapshot, so session sandboxes start ready
  // instead of setting up eve's runtime with the network already off.
  prepare: async (sandbox) => {
    await sandbox.writeTextFile({
      content:
        "# Workspace\\n\\nThis sandbox reaches only the domains it's allowed. Use web_fetch for web pages.\\n",
      path: "README.md",
    });
  },
});

function networkPolicy() {
  return ALLOWED_DOMAINS.length === 0
    ? "deny-all"
    : {
        allow: Object.fromEntries(
          ALLOWED_DOMAINS.map((domain) => [domain, []])
        ),
      };
}

export default defineSandbox(() =>
  environment.open(process.env.VERCEL ? { networkPolicy: networkPolicy() } : {})
);
`;
}

const DOMAINS_LINE =
  /const ALLOWED_DOMAINS: readonly string\[\] = \[(?<list>[^\]]*)\];/u;
const QUOTED = /"(?<value>[^"]*)"/gu;

/** A domain the sandbox may reach: a plain hostname, lowercase. */
function isDomain(value: string): boolean {
  return HOSTNAME.test(value);
}

/** Checks and normalizes domains for the sandbox. */
function cleanDomains(domains: readonly string[]): string[] {
  const clean = [
    ...new Set(domains.map((domain) => domain.trim().toLowerCase())),
  ].filter(Boolean);
  const invalid = clean.filter((domain) => !isDomain(domain));
  if (invalid.length > 0) {
    throw new Error(
      `Not a domain: ${invalid.join(", ")}. Use plain hostnames such as registry.npmjs.org.`
    );
  }
  if (clean.length > MAX_DOMAINS) {
    throw new Error(`Allow at most ${MAX_DOMAINS} domains.`);
  }
  return clean;
}

/** A tool file's setting: absent is on, eve's `disableTool()` is off; anything else isn't ours. */
function readSwitch(source: string | undefined): ToolSwitch | undefined {
  if (source === undefined) {
    return "on";
  }
  return source === DISABLED_TOOL ? "off" : undefined;
}

function readWebFetch(source: string | undefined): WebFetchMode | undefined {
  if (source === undefined) {
    return "never";
  }
  if (source === DISABLED_TOOL) {
    return "off";
  }
  if (source === webFetchSource("always")) {
    return "always";
  }
  return source === webFetchSource("once") ? "once" : undefined;
}

function readSandbox(source: string | undefined): string[] | undefined {
  const list = source === undefined ? undefined : DOMAINS_LINE.exec(source);
  if (list?.groups === undefined) {
    return;
  }
  const domains = [...(list.groups.list ?? "").matchAll(QUOTED)].map(
    (match) => match.groups?.value ?? ""
  );
  return domains.every(isDomain) && sandboxSource(domains) === source
    ? domains
    : undefined;
}

/**
 * A member's access settings from its files. A setting whose file was edited
 * by hand is left out, so the dashboard shows it as read-only.
 */
export function readMemberAccess(files: {
  readonly bash: string | undefined;
  readonly sandbox: string | undefined;
  readonly webFetch: string | undefined;
  readonly webSearch: string | undefined;
}): MemberAccess {
  const bash = readSwitch(files.bash);
  const webSearch = readSwitch(files.webSearch);
  const webFetch = readWebFetch(files.webFetch);
  const sandboxDomains = readSandbox(files.sandbox);
  return {
    ...(bash === undefined ? {} : { bash }),
    ...(webSearch === undefined ? {} : { webSearch }),
    ...(webFetch === undefined ? {} : { webFetch }),
    ...(sandboxDomains === undefined ? {} : { sandboxDomains }),
  };
}

/** A tool file's content for a setting; `null` removes the file (the tool's default, on). */
function writeSwitch(value: ToolSwitch): string | null {
  return value === "off" ? DISABLED_TOOL : null;
}

function writeWebFetch(value: WebFetchMode): string | null {
  if (value === "off") {
    return DISABLED_TOOL;
  }
  if (value === "never") {
    throw new Error("The dashboard doesn't turn off web_fetch's approval.");
  }
  return webFetchSource(value);
}

/**
 * The files for changed access settings, by their path under `agent/`. `null`
 * removes a file. Only settings in `changes` are written.
 */
export function writeMemberAccess(
  changes: MemberAccess
): Record<string, string | null> {
  const files: Record<string, string | null> = {};
  if (changes.bash !== undefined) {
    files[ACCESS_FILES.bash] = writeSwitch(changes.bash);
  }
  if (changes.webSearch !== undefined) {
    files[ACCESS_FILES.webSearch] = writeSwitch(changes.webSearch);
  }
  if (changes.webFetch !== undefined) {
    files[ACCESS_FILES.webFetch] = writeWebFetch(changes.webFetch);
  }
  if (changes.sandboxDomains !== undefined) {
    files[ACCESS_FILES.sandbox] = sandboxSource(
      cleanDomains(changes.sandboxDomains)
    );
  }
  return files;
}
