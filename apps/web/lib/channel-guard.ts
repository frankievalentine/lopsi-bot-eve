/**
 * The gate every Chat SDK channel shares (email, SMS, WhatsApp, Matrix…): a
 * message reaches the agent only when the channel accepts it, by default when
 * its sender is on LOPSI_<CHANNEL>_SENDERS. Anything else is dropped without a
 * reply, so a stranger learns nothing. The turn runs as the sender, so
 * sign-ins and approvals reach them alone.
 *
 * @packageDocumentation
 */

import { randomBytes } from "node:crypto";
import { createMemoryState } from "@chat-adapter/state-memory";
import { createRedisState } from "@chat-adapter/state-redis";
import type { Message, Thread } from "chat";
import type { chatSdkChannel } from "eve/channels/chat-sdk";
import { messageContentOf } from "eve/channels/chat-sdk";
import { redisStateUrl, sendersVariable } from "./channel-core.mjs";

type ChatSdkChannel = ReturnType<typeof chatSdkChannel>;

/**
 * Whether the channel's allowlist has this sender: a comma-separated list of
 * the provider's sender ids (phone numbers in +E.164, user ids). Empty allows
 * nobody.
 */
function isAllowedOn(channel: string, sender: string): boolean {
  const id = sender.trim().toLowerCase();
  return (process.env[sendersVariable(channel)] ?? "")
    .split(",")
    .map((entry) => entry.trim().toLowerCase())
    .some((entry) => entry !== "" && entry === id);
}

/**
 * A channel's adapter. eve needs every Chat SDK channel to have one, and some
 * adapters throw when built without their variables, so while the channel is
 * off (`enabled` false) its missing variables hold random placeholders just
 * for the build. Its webhook then fails the provider's signature check, and
 * the guard drops anything that gets through.
 */
export function buildAdapter<T>(
  enabled: boolean,
  variables: readonly string[],
  create: () => T
): T {
  if (enabled) {
    return create();
  }
  const missing = variables.filter((name) => !process.env[name]?.trim());
  for (const name of missing) {
    process.env[name] = `unconfigured-${randomBytes(24).toString("hex")}`;
  }
  try {
    return create();
  } finally {
    for (const name of missing) {
      delete process.env[name];
    }
  }
}

/**
 * A channel's thread state: Redis under the channel's key prefix while it's
 * on, in-memory while it's off (the Redis adapter needs its URL up front).
 */
export function channelState(keyPrefix: string, enabled: boolean) {
  const url = redisStateUrl();
  return enabled && url
    ? createRedisState({ keyPrefix, url })
    : createMemoryState();
}

/**
 * Registers the channel's handlers behind its gate. `accept` decides each
 * message (the default checks the allowlist) and says why it dropped one, for
 * the logs.
 */
export function guardChannel(options: {
  readonly accept?: (message: Message) => {
    readonly ok: boolean;
    readonly why: Readonly<Record<string, unknown>>;
  };
  /** Names how senders authenticated in session auth (`resend:email`). */
  readonly authenticator?: string;
  /** Whether the channel is set up; while it's off, every message is dropped. */
  readonly enabled?: boolean;
  readonly bot: ChatSdkChannel["bot"];
  readonly channel: string;
  readonly send: ChatSdkChannel["send"];
}): void {
  const { bot, channel, send } = options;
  const authenticator = options.authenticator ?? channel;
  const accept =
    options.accept ??
    ((message: Message) => {
      const allowed = isAllowedOn(channel, message.author.userId);
      return { ok: allowed, why: { allowed } };
    });
  const accepted = (message: Message) => {
    const verdict =
      options.enabled === false
        ? { ok: false, why: { off: true } }
        : accept(message);
    if (!verdict.ok) {
      console.warn(`[lopsi] dropped a ${channel} message`, verdict.why);
    }
    return verdict.ok;
  };
  const deliver = (thread: Thread, message: Message) =>
    send(messageContentOf(message), {
      auth: {
        attributes: {
          ...(message.author.fullName ? { name: message.author.fullName } : {}),
          sender: message.author.userId,
        },
        authenticator,
        principalId: message.author.userId,
        principalType: "user",
      },
      idempotencyKey: message.id,
      thread,
    });

  bot.onNewMention(async (thread, message) => {
    if (!accepted(message)) {
      return;
    }
    await thread.subscribe();
    await deliver(thread, message);
  });
  bot.onSubscribedMessage(async (thread, message) => {
    if (accepted(message)) {
      await deliver(thread, message);
    }
  });
}
