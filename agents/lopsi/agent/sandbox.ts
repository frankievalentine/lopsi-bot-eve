import { DefaultSandbox, defineSandbox } from "eve/sandbox";

/**
 * Each chat's sandbox. On Vercel it has no network access, so nothing the
 * crew reads (a page, a connector's data) can make `bash` send it anywhere;
 * web pages come through web_fetch, which asks first. Locally eve uses
 * just-bash, which can't restrict the network.
 */
export const environment = DefaultSandbox.environment({
  // Captured in the build's snapshot, so session sandboxes start ready
  // instead of setting up eve's runtime with the network already off.
  prepare: async (sandbox) => {
    await sandbox.writeTextFile({
      content:
        "# Workspace\n\nThis sandbox has no network access. Use web_fetch for web pages.\n",
      path: "README.md",
    });
  },
});

export default defineSandbox(() =>
  environment.open(process.env.VERCEL ? { networkPolicy: "deny-all" } : {})
);
