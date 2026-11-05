# Integrations

The crew reaches other services and people three ways. Each is off until you set it up, from a clone of your repository linked to its Vercel project (`vercel link`):

| Integration | What it gives the crew | Set up with |
| --- | --- | --- |
| [Connectors](#connectors) | Tools from a service's MCP server, acting as the person asking: Linear, Notion, Sentry, Resend, or any MCP service in Vercel Connect | `pnpm setup:connector <service>` |
| [Email](#email) | An address per crew member that people can write to, and email sent from the crew (through the Resend connector) | `pnpm setup:email` |
| [Channels](#channels) | A messaging channel per crew member: AgentPhone, Dial and Sendblue (SMS, iMessage, voice), Kapso (WhatsApp), Lark / Feishu, Liveblocks and Velt (comment threads), Novu and Zernio (several platforms) | `pnpm setup:channel <channel>` |

Settings → **Integrations** in the dashboard shows which are Active; Settings → **Crew** shows each member's services and active channels. Every integration follows the same rules: anything that changes something waits for approval, and on email and channels only senders you allow reach the crew.

## Connectors

The crew can use any service with an MCP server through [Vercel Connect](https://vercel.com/docs/connect). Linear, Notion, Sentry and Resend are listed already. None is on until you set it up, so the agent never reaches for a service it can't use:

```sh
pnpm setup:connector linear                      # listed in connectors.json
pnpm setup:connector asana                       # any Vercel Connect service with MCP
pnpm setup:connector https://mcp.example.com/mcp --name Example --description "What it does"
eve deploy
```

The script creates a Vercel Connect connector for the service, attaches it to the project and stores its UID in `LINEAR_CONNECTOR` (or `NOTION_CONNECTOR`, `SENTRY_CONNECTOR`). The first time the crew needs the service, it asks you in the chat to connect your own account. In starter mode everyone shares one connection.

- Tools the service marks read-only run straight away; every other call waits for your approval.
- An entry can narrow what the crew sees and when it asks: `tools` (`{ "allow": [...] }` for an explicit list, so tools the server adds later stay hidden, or `{ "block": [...] }`) and `approve` (tools that always ask first, whatever the server says about them). Resend sees 47 of its tools (campaigns, templates, one-off sends, contacts, delivery logs, verified domains; no account administration), and sending or deleting always asks.
- **Connections** in the sidebar shows which services you've connected, and disconnects one by revoking your grant at Vercel Connect.
- A service that isn't listed yet is added to `apps/web/lib/connectors.json` with the MCP URL its connector reports; commit that file. Find services with `vercel connect discover <query>`.
- A connector you created in the Vercel dashboard is reused when it's for the same MCP server.
- Some services need your own OAuth client: pass its credentials with `--data <file>` (`vercel connect create <service> --help` says which).
- Services without an MCP server (API keys or OAuth to an API only) can't become crew tools this way; they need a tool written for their API.

## Email

The crew can send and receive email through [Resend](https://resend.com):

```sh
pnpm setup:email
```

It asks whether the crew should **send** email (the Resend connector: each person connects their own Resend account, and every send waits for approval) and **receive** it. For receiving, it adds [Upstash for Redis](https://vercel.com/marketplace/upstash) from the Vercel Marketplace for thread state if the project has none, asks for your Resend API key (not echoed; saved as a sensitive variable), the domain to receive at, and who may write, then creates each crew member's Resend webhook. Deploy afterwards.

- Each crew member answers its own address, `<member>@<domain>`. Replies stay in the email thread; approvals and questions arrive as numbered options you answer by replying.
- Only senders on `LOPSI_EMAIL_SENDERS` (addresses, or whole domains as `@example.com`) reach the crew, and only when the receiving server reports a DMARC pass for the sender's domain, so a forged From address doesn't get through. Everything else is dropped without a reply; the deployment's logs say why. Set `LOPSI_EMAIL_AUTHSERV_ID` to the receiving server's name to trust only its results.
- The domain needs receiving turned on in Resend (an MX record), or use your account's `<id>.resend.app` address.
- Re-run `pnpm setup:email` after adding a crew member, to create its webhook.

## Channels

Besides the web chat and email, a crew member can answer a messaging channel through its provider's own [Chat SDK](https://chat-sdk.dev) adapter: AgentPhone, Dial and Sendblue (SMS, iMessage, voice), Kapso (WhatsApp), Lark / Feishu, Liveblocks and Velt (comment threads), Novu and Zernio (several platforms at once).

```sh
pnpm setup:channel sendblue
```

It asks which crew member answers, installs the adapter, writes `agents/<member>/agent/channels/<channel>.ts`, adds Upstash for Redis if the project has none, asks for the provider's keys (secrets aren't echoed) and who may write (`LOPSI_<CHANNEL>_SENDERS`: phone numbers or the provider's user ids), and prints the webhook URL to give the provider. Commit the new file, `package.json` and `pnpm-lock.yaml`, then deploy.

- One crew member answers each channel. Everyone else's messages are dropped without a reply; the turn runs as the sender, so approvals and sign-ins reach only them. Phone numbers can be spoofed, which is why actions still ask first.
- A channel whose variables aren't set is off: its webhook fails the provider's signature check and every message is dropped, so a committed channel never breaks `eve dev` or a deployment.
- **Settings → Integrations** lists each channel as Off or Active; **Crew** shows which member answers which.
- Beeper isn't offered: its adapter (0.2.0) can't be loaded by Node as published.
