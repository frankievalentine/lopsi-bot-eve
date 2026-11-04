import type { HookContext } from "eve/hooks";
import { defineHook } from "eve/hooks";
import {
  recordChatMessage,
  recordChatReply,
} from "../../../../apps/web/lib/chat-store.js";
import { isProductionMode } from "../../../../apps/web/lib/production-mode.js";
import {
  recordSessionOwner,
  type SessionOwner,
} from "../../../../apps/web/lib/session-owners.js";

/** Whose list a session's chat goes in: the person who started it, in production mode. */
function ownerOf(ctx: HookContext): SessionOwner | undefined {
  const { initiator } = ctx.session.auth;
  if (!isProductionMode() || initiator?.principalType !== "user") {
    return;
  }
  return {
    authenticator: initiator.authenticator,
    principalId: initiator.principalId,
  };
}

/** The chat list is a convenience; a storage error never fails the turn. */
async function quietly(write: Promise<void>): Promise<void> {
  try {
    await write;
  } catch (error) {
    console.error("[lopsi] couldn't update the chat list:", error);
  }
}

/**
 * Records who started each session (the chat owner check), and keeps each
 * person's chat list (apps/web/lib/chat-store.ts) as the agent works, so it's
 * right on every device and updates while no browser is open.
 */
export default defineHook({
  events: {
    async "content.completed"(event, ctx) {
      const owner = ownerOf(ctx);
      if (
        owner &&
        event.data.phase === "reply" &&
        event.data.kind === "text" &&
        typeof event.data.value === "string"
      ) {
        await quietly(recordChatReply(owner, ctx.session.id, event.data.value));
      }
    },
    async "delivery.consumed"(event, ctx) {
      const owner = ownerOf(ctx);
      const text = event.data.parts
        .flatMap((part) => (part.kind === "text" ? [part.text] : []))
        .join(" ");
      if (owner && text) {
        await quietly(
          recordChatMessage(owner, ctx.agent.name, ctx.session.id, text)
        );
      }
    },
    // Production mode: who started each session, on every channel (the web,
    // email), so requireSessionOwner keeps it to them. Unlike the chat list,
    // a failure here fails the turn: this is the access check's record.
    async "turn.started"(_event, ctx) {
      const { initiator } = ctx.session.auth;
      if (isProductionMode() && initiator) {
        await recordSessionOwner(ctx.session.id, initiator);
      }
    },
  },
});
