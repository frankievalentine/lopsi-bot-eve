/**
 * The gate for Chat SDK channels (email): a message reaches the agent only
 * when the channel accepts it. Anything else is dropped without a reply, so a
 * stranger learns nothing. The turn runs as the sender, so sign-ins and
 * approvals reach them alone.
 *
 * @packageDocumentation
 */
import { createMemoryState } from "@chat-adapter/state-memory";
import { createRedisState } from "@chat-adapter/state-redis";
import type { Message, Thread } from "chat";
import type { chatSdkChannel } from "eve/channels/chat-sdk";
import { messageContentOf } from "eve/channels/chat-sdk";
import { redisStateUrl } from "./email";

type ChatSdkChannel = ReturnType<typeof chatSdkChannel>;

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
 * message and says why it dropped one, for
 * the logs.
 */
export function guardChannel(options: {
  readonly accept: (message: Message) => Promise<{
    readonly ok: boolean;
    readonly why: Readonly<Record<string, unknown>>;
  }>;
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
  const accepted = async (message: Message) => {
    const verdict =
      options.enabled === false
        ? { ok: false, why: { off: true } }
        : await options.accept(message);
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
    if (!(await accepted(message))) {
      return;
    }
    await thread.subscribe();
    await deliver(thread, message);
  });
  bot.onSubscribedMessage(async (thread, message) => {
    if (await accepted(message)) {
      await deliver(thread, message);
    }
  });
}
