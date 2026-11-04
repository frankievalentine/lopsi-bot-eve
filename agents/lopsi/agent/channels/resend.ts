import { createResendAdapter } from "@resend/chat-sdk-adapter";
import type { Message } from "chat";
import { chatSdkChannel } from "eve/channels/chat-sdk";
import { webhookSecretVariable } from "../../../../apps/web/lib/channel-core.mjs";
import {
  buildAdapter,
  channelState,
  guardChannel,
} from "../../../../apps/web/lib/channel-guard.js";
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
const SECRET = webhookSecretVariable(MEMBER_ID);

/**
 * Email for this crew member, at `<member>@LOPSI_EMAIL_DOMAIN`, through Resend
 * (apps/web/lib/email.ts, `pnpm setup:email`). Its webhook is
 * `/eve/<member>/v1/resend`. Until email is set up, its adapter gets
 * placeholders (buildAdapter), so every webhook fails Resend's signature check.
 */
const { bot, channel, send } = chatSdkChannel({
  adapters: {
    resend: buildAdapter(setup !== undefined, ["RESEND_API_KEY", SECRET], () =>
      createResendAdapter({
        apiKey: process.env.RESEND_API_KEY ?? "",
        fromAddress: setup?.address ?? `${MEMBER_ID}@unconfigured.invalid`,
        fromName: name,
        webhookSecret: process.env[SECRET] ?? "",
      })
    ),
  },
  // A message arriving mid-reply joins the running turn.
  concurrency: "concurrent",
  state: channelState(`lopsi:${MEMBER_ID}`, setup !== undefined),
  // Email can't edit a sent message, so each reply posts once.
  streaming: false,
  userName: name,
});

/**
 * Mail to this member, from an allowed sender, whose domain vouches for it
 * (DMARC).
 */
function accept(message: Message) {
  const raw = message.raw as {
    cc?: string[];
    headers?: Record<string, string>;
    to?: string[];
  };
  const sender = message.author.userId;
  const recipients = [...(raw.to ?? []), ...(raw.cc ?? [])].map(bareAddress);
  const allowed = isAllowedSender(sender);
  const dmarc = passesDmarc(raw.headers, sender);
  return {
    ok:
      setup !== undefined &&
      recipients.includes(setup.address) &&
      allowed &&
      dmarc,
    why: { allowed, dmarc, member: MEMBER_ID, to: recipients },
  };
}

guardChannel({
  accept,
  authenticator: "resend:email",
  bot,
  channel: "resend",
  enabled: setup !== undefined,
  send,
});

export default channel;
