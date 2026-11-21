# Integrations

The crew reaches other services through [Vercel Connect](https://vercel.com/docs/connect), whatever the service: you add it in Vercel, and Lopsi picks it up. Nothing in this repository names a service, and there's nothing to run or redeploy.

| Integration | What it gives the crew | Set up in |
| --- | --- | --- |
| [Services](#services) | Any of Vercel Connect's services: Slack, Google, Stripe, Linear, Notion, GitHub, Sentry, and the rest | Vercel Connect |
| [Chat in Slack or Telegram](#chat-in-slack-or-telegram) | People talk to a crew member there, as well as in the dashboard | Vercel Connect, then Settings |
| [Email](#email) | An address per crew member that people can write to | `pnpm setup:email` |

## Let Lopsi see your connectors

A deployment can't list its own connectors with its OIDC token, so Lopsi needs a Vercel access token for that:

1. [Create a token](https://vercel.com/account/tokens) scoped to the project's team, with an expiry.
2. Add it to the project as `VERCEL_TOKEN`, marked **Sensitive**, then redeploy. The Deploy button asks for it up front.

Only the server reads it: the model, the sandbox and the browser never see it. A Vercel token can do anything on its team, so treat it like a password, and replace it before it expires. Without it, Settings → **Integrations** says so, and the crew has no services.

## Services

Open Settings → **Integrations** → **Add in Vercel**. It takes you to the project's Connect page. Create a connector for any service and attach it to this project. Within a minute it's listed in Settings and the crew can use it; **Refresh** checks sooner.

What the crew gets depends on the connector:

- **An MCP server** (a connector created with the MCP method): its tools, named after the connector (`my-linear__search_issues`). Tools the server marks read-only run straight away; every other call waits for approval.
- **Anything else** (an API key or OAuth to the service's API: Stripe, Google, Slack, Telegram, …): the `call_service` tool, which calls the service's HTTP API with the connector's credential. The credential is added on the server, so the model never sees it.
  - The first time the credential would go to a new host (`api.stripe.com`), the crew asks you first. Once you approve, later reads there go ahead for everyone. Settings lists the approved hosts for each connector, and removing one makes the crew ask again. Without the Blob store nothing is remembered, so every call asks.
  - Anything other than a read (`GET`) always asks first.
  - Redirects aren't followed, so the credential never reaches a host nobody approved.

Where a service supports it, each person signs in with their own account the first time the crew needs it, with a sign-in card in the chat. **Connections** in the sidebar shows which you've connected, and disconnects one. Otherwise the crew uses the connector's own credential, the same for everyone. In starter mode everyone shares one identity, and so one connection.

To limit a crew member to some services, list their names in its `crew.json` `connectors` (Settings shows each name), or pick them in **Edit**.

The dashboard opens pull requests through a GitHub connector: the one the Deploy button adds (`GITHUB_CONNECTOR`), or any GitHub connector attached to the project.

## Chat in Slack or Telegram

Besides the dashboard, people can talk to Lopsi in Slack or Telegram. Add a Slack or Telegram connector in Vercel Connect, as above. Then, in Settings → **Integrations**, click **Turn On** next to **Chat with Lopsi**. That has the connector send its messages to `/eve/lopsi/v1/slack` (or `/telegram`). Connect checks each message and forwards it, so the deployment holds no Slack or Telegram secret.

- **Slack:** anyone in the workspace where the app is installed can mention or message it.
- **Telegram:** anyone can find a bot, so only private chats from people on `LOPSI_TELEGRAM_SENDERS` (usernames or user ids, comma-separated) get an answer. Everything else is dropped without a reply, and the deployment's logs name the sender, so you can add them.
- The same connector also lets the crew send messages there through `call_service`, for example to post a summary to a channel, or message you when something finishes. A Telegram bot can only message people who have messaged it first.
- Lopsi answers these channels. To have another member answer instead, move `agents/lopsi/agent/channels/slack.ts` (or `telegram.ts`) to that member and change its `MEMBER_ID`.

## Email

The crew can send and receive email through [Resend](https://resend.com):

```sh
pnpm setup:email
```

To have the crew **send** email, add a Resend connector in Vercel Connect, like any other [service](#services). The script sets up **receiving**: it adds [Upstash for Redis](https://vercel.com/marketplace/upstash) from the Vercel Marketplace for thread state if the project has none, asks for your Resend API key (not echoed; saved as a sensitive variable), the domain to receive at, and who may write, then creates each crew member's Resend webhook. Deploy afterwards.

- Each crew member answers its own address, `<member>@<domain>`. Replies stay in the email thread; approvals and questions arrive as numbered options you answer by replying.
- Only senders on `LOPSI_EMAIL_SENDERS` (addresses, or whole domains as `@example.com`) reach the crew, and only when the receiving server reports a DMARC pass for the sender's domain, so a forged From address doesn't get through. Everything else is dropped without a reply; the deployment's logs say why. Set `LOPSI_EMAIL_AUTHSERV_ID` to the receiving server's name to trust only its results.
- The domain needs receiving turned on in Resend (an MX record), or use your account's `<id>.resend.app` address.
- Re-run `pnpm setup:email` after adding a crew member, to create its webhook.
