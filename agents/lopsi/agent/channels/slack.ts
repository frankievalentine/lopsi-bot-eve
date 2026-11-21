import { getToken } from "@vercel/connect";
import { createConnectWebhookVerifier } from "@vercel/connect/chat";
import { slackChannel } from "eve/channels/slack";
import { chatConnector } from "../../../../apps/web/lib/connectors.js";

// The crew member that answers Slack: its events arrive at /eve/<MEMBER_ID>/v1/slack.
// New crew members don't copy this channel; to have another member answer,
// move this file to it and change this line.
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
