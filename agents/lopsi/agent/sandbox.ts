import { DefaultSandbox, defineSandbox } from "eve/sandbox";

/**
 * Domains the shell may reach on Vercel; empty means no network. Edited from
 * the dashboard (a crew member's Edit), which keeps this file's shape.
 */
const ALLOWED_DOMAINS: readonly string[] = [];

/**
 * Each chat's sandbox. On Vercel it reaches only ALLOWED_DOMAINS, so nothing
 * the crew reads (a page, a connector's data) can make `bash` send it
 * anywhere else; web pages come through web_fetch, which asks first. Locally
 * eve uses just-bash, which can't restrict the network.
 */
export const environment = DefaultSandbox.environment({
  // Captured in the build's snapshot, so session sandboxes start ready
  // instead of setting up eve's runtime with the network already off.
  prepare: async (sandbox) => {
    await sandbox.writeTextFile({
      content:
        "# Workspace\n\nThis sandbox reaches only the domains it's allowed. Use web_fetch for web pages.\n",
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
