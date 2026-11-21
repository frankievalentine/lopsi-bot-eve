import { createResendAdapter } from "@resend/chat-sdk-adapter";
import { getToken } from "@vercel/connect";
import { createConnectWebhookVerifier } from "@vercel/connect/chat";
import type { Message } from "chat";
import { chatSdkChannel } from "eve/channels/chat-sdk";
import { allowedSenders } from "../../../../apps/web/lib/allowed-senders.js";
import {
  channelState,
  guardChannel,
} from "../../../../apps/web/lib/channel-guard.js";
import { emailConnector } from "../../../../apps/web/lib/connectors.js";
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
 * Email for this crew member, at `<member>@LOPSI_EMAIL_DOMAIN`, through the
 * Resend connector Settings turned email on with (apps/web/lib/email.ts).
 * Connect checks Resend's signature and forwards each email to app/api/email,
 * which hands it here (`/eve/<member>/v1/resend`) with the deployment's OIDC
 * token, so this deployment holds no Resend key or webhook secret.
 */
const { bot, channel, send } = chatSdkChannel({
  adapters: {
    resend: createResendAdapter({
      apiKey: async () => {
        const connector = await emailConnector();
        if (connector === undefined) {
          throw new Error("No Resend connector receives the crew's email.");
        }
        return await getToken(connector.id, { subject: { type: "app" } });
      },
      fromAddress: setup?.address ?? `${MEMBER_ID}@unconfigured.invalid`,
      fromName: name,
      webhookVerifier: createConnectWebhookVerifier(),
    }),
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
async function accept(message: Message) {
  const raw = message.raw as {
    cc?: string[];
    headers?: Record<string, string>;
    to?: string[];
  };
  const sender = message.author.userId;
  const recipients = [...(raw.to ?? []), ...(raw.cc ?? [])].map(bareAddress);
  const allowed = isAllowedSender(sender, await allowedSenders("email"));
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
