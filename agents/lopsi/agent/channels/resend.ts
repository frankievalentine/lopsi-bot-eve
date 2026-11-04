import { randomBytes } from "node:crypto";
import { createMemoryState } from "@chat-adapter/state-memory";
import { createRedisState } from "@chat-adapter/state-redis";
import { createResendAdapter } from "@resend/chat-sdk-adapter";
import type { Message, Thread } from "chat";
import { chatSdkChannel, messageContentOf } from "eve/channels/chat-sdk";
import {
  bareAddress,
  emailSetup,
  isAllowedSender,
  passesDmarc,
} from "../../../../apps/web/lib/email.js";
import crew from "../../crew.json" with { type: "json" };

// This crew member's id. The dashboard's New crew member rewrites this line
// when it copies the channel; copy it by hand the same way.
const MEMBER_ID = "lopsi";

const setup = emailSetup(MEMBER_ID);
const name = crew.name ?? MEMBER_ID;

/**
 * Email for this crew member, at `<member>@LOPSI_EMAIL_DOMAIN`, through Resend
 * (apps/web/lib/email.ts, `pnpm setup:email`). Its webhook is
 * `/eve/<member>/v1/resend`. Until email is set up, a random secret makes
 * every webhook fail Resend's signature check.
 */
const { bot, channel, send } = chatSdkChannel({
  adapters: {
    resend: createResendAdapter({
      apiKey: setup?.apiKey ?? "re_unconfigured",
      fromAddress: setup?.address ?? `${MEMBER_ID}@unconfigured.invalid`,
      fromName: name,
      webhookSecret:
        setup?.webhookSecret ?? `whsec_${randomBytes(24).toString("base64")}`,
    }),
  },
  // A message arriving mid-reply joins the running turn.
  concurrency: "concurrent",
  state: setup
    ? createRedisState({ keyPrefix: `lopsi:${MEMBER_ID}`, url: setup.redisUrl })
    : createMemoryState(),
  // Email can't edit a sent message, so each reply posts once.
  streaming: false,
  userName: name,
});

/**
 * Whether to answer: mail to this member, from an allowed sender, whose
 * domain vouches for it (DMARC). Anything else is dropped without a reply, so
 * a stranger learns nothing.
 */
function accepted(message: Message): boolean {
  const raw = message.raw as {
    cc?: string[];
    headers?: Record<string, string>;
    to?: string[];
  };
  const sender = message.author.userId;
  const recipients = [...(raw.to ?? []), ...(raw.cc ?? [])].map(bareAddress);
  const ok =
    setup !== undefined &&
    recipients.includes(setup.address) &&
    isAllowedSender(sender) &&
    passesDmarc(raw.headers, sender);
  if (!ok) {
    console.warn(`[lopsi] dropped email for ${MEMBER_ID}`, {
      allowed: isAllowedSender(sender),
      dmarc: passesDmarc(raw.headers, sender),
      to: recipients,
    });
  }
  return ok;
}

/** The sender runs the turn as themselves, so sign-ins and approvals reach them alone. */
function deliver(thread: Thread, message: Message) {
  return send(messageContentOf(message), {
    auth: {
      attributes: {
        email: message.author.userId,
        ...(message.author.fullName ? { name: message.author.fullName } : {}),
      },
      authenticator: "resend:email",
      principalId: message.author.userId,
      principalType: "user",
    },
    idempotencyKey: message.id,
    thread,
  });
}

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

export default channel;
