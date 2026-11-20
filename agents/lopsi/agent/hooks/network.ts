import { defineState } from "eve/context";
import { defineHook } from "eve/hooks";
import { environment, networkPolicy } from "../sandbox";

/** The network policy last applied to this chat's sandbox, as JSON. */
const applied = defineState<string | null>("lopsi.sandbox-network", () => null);

/**
 * eve sets a sandbox's network policy only when it creates it; one that's
 * resumed keeps the policy it began with. So without this, a chat opened
 * before a domain was removed from sandbox.ts could still reach that domain
 * for as long as the chat lives. Before each shell command, the live sandbox
 * gets this deployment's policy, once per change. On Vercel only, like
 * sandbox.ts. The turn waits for the hook, so the command never runs first;
 * if the policy can't be applied, the turn is cancelled rather than run on
 * the old one.
 */
export default defineHook({
  events: {
    async "call.requested"(event, ctx) {
      if (!process.env.VERCEL || event.data.capability.name !== "bash") {
        return;
      }
      const policy = networkPolicy();
      const key = JSON.stringify(policy);
      if (applied.get() === key) {
        return;
      }
      try {
        const sandbox = await ctx.getSandbox(environment);
        await sandbox.setNetworkPolicy(policy);
        applied.update(() => key);
      } catch (error) {
        console.error("[lopsi] couldn't apply the sandbox network:", error);
        ctx.cancel("The sandbox's network settings couldn't be applied.");
      }
    },
  },
});
