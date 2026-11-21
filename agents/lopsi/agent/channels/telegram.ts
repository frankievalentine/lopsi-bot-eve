import { getToken } from "@vercel/connect";
import { createConnectWebhookVerifier } from "@vercel/connect/chat";
import { defaultTelegramAuth, telegramChannel } from "eve/channels/telegram";
import { allowedSenders } from "../../../../apps/web/lib/allowed-senders.js";
import { chatConnector } from "../../../../apps/web/lib/connectors.js";

// The crew member that answers Telegram: its events arrive at /eve/<MEMBER_ID>/v1/telegram.
// New crew members don't copy this channel; to have another member answer,
// move this file to it and change this line.
const MEMBER_ID = "lopsi";

/**
 * Telegram, through a Telegram connector attached to this project in Vercel Connect.
 * Settings → Integrations has it send messages here (`/eve/<member>/v1/telegram`);
 * until then nothing arrives. Connect checks Telegram's secret header and forwards
 * each event with a Vercel OIDC token, which the verifier checks, so this
 * deployment holds no bot token. The connector is found when a message
 * comes in, so one attached later works without a redeploy.
 *
 * Anyone can message a bot, so only private chats from the people Settings
 * allows (usernames or user ids, apps/web/lib/allowed-senders.ts) reach the
 * agent. Anything else is dropped without a reply; the log names the sender,
 * to add them.
 */
export default telegramChannel({
  credentials: {
    botToken: async () =>
      getToken((await chatConnector(MEMBER_ID, "telegram")).id, {
        subject: { type: "app" },
      }),
    webhookVerifier: createConnectWebhookVerifier(),
  },
  async onMessage(_ctx, message) {
    const { from } = message;
    const allowed =
      message.chat.type === "private" && from !== undefined
        ? await allowedSenders("telegram")
        : [];
    const ok =
      message.chat.type === "private" &&
      from !== undefined &&
      (allowed.includes(from.id) ||
        (from.username !== undefined &&
          allowed.includes(from.username.toLowerCase())));
    if (!ok) {
      console.warn("[lopsi] dropped a telegram message", {
        chat: message.chat.type,
        id: from?.id,
        username: from?.username,
      });
      return null;
    }
    return { auth: defaultTelegramAuth(message) };
  },
});
