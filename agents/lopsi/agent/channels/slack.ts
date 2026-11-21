import { getToken } from "@vercel/connect";
import { createConnectWebhookVerifier } from "@vercel/connect/chat";
import { slackChannel } from "eve/channels/slack";
import { chatConnector } from "../../../../apps/web/lib/connectors.js";

// This crew member's id. The dashboard's New crew member rewrites this line
// when it copies the channel; copy it by hand the same way.
const MEMBER_ID = "lopsi";

/**
 * Slack, through a Slack connector attached to this project in Vercel Connect.
 * Settings → Integrations has it send messages here (`/eve/<member>/v1/slack`);
 * until then nothing arrives. Connect checks Slack's signature and forwards
 * each event with a Vercel OIDC token, which the verifier checks, so this
 * deployment holds no Slack secret. The connector is found when a message
 * comes in, so one attached later works without a redeploy.
 */
export default slackChannel({
  credentials: {
    botToken: async () =>
      getToken((await chatConnector(MEMBER_ID, "slack")).id, {
        subject: { type: "app" },
      }),
    webhookVerifier: createConnectWebhookVerifier(),
  },
});
