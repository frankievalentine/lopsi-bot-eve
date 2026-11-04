<img alt="Lopsi Bot" height="96" src="apps/web/public/l-mark.svg" width="96">

# Lopsi Bot for eve

A crew of [eve](https://eve.dev) agents with the Lopsi Bot dashboard, deployed on Vercel. Each crew member is an eve workspace agent under `agents/<name>/`, and the web chat in `apps/web/` talks to it over that agent's routes (`/eve/<name>/v1`).

Status: early. Working: both access modes, the Lopsi dashboard (crew list, chat, approvals and questions, a computer panel per chat), server-side chat history, connectors, email and messaging channels, Settings, and changing the crew by pull request.

## Deploy

[![Deploy with Vercel](https://vercel.com/button)](https://vercel.com/new/clone?repository-url=https%3A%2F%2Fgithub.com%2Ffrankievalentine%2Flopsi-bot-eve&project-name=lopsi-bot&repository-name=lopsi-bot&env=LOPSI_ACCESS_PASSWORD&envDescription=The%20password%20your%20crew%27s%20visitors%20enter.%20At%20least%2016%20characters%3B%20generate%20one%20with%3A%20openssl%20rand%20-base64%2032&envLink=https%3A%2F%2Fgithub.com%2Ffrankievalentine%2Flopsi-bot-eve%23starter-mode&connect=%5B%7B%22type%22%3A%22github%22%2C%22env%22%3A%22GITHUB_CONNECTOR%22%7D%5D)

The button clones this repository into your GitHub account and deploys it. It asks for two things:

- **`LOPSI_ACCESS_PASSWORD`**: the shared password for [starter mode](#starter-mode). That's all a deployment needs to run.
- **A GitHub App connector** (`GITHUB_CONNECTOR`): lets the dashboard open pull requests for crew changes. Install the app on your new repository with read and write access to contents and pull requests.

Then, from a clone of your repository, linked to the project (`vercel link`), add what you need:

| Command | Adds |
| --- | --- |
| `pnpm setup:sign-in` | [Production mode](#production-mode): Sign in with Vercel for your team, one identity per person, private chats and history |
| `pnpm setup:connector <service>` | [Connectors](#connectors): Linear, Notion, Sentry, Resend, or any MCP service |
| `pnpm setup:email` | [Email](#email) to and from the crew |
| `pnpm setup:channel <channel>` | [Channels](#channels): SMS, iMessage, WhatsApp and more |


## Access

A deployment admits people in one of two modes. Production mode takes precedence when it is configured.

### Starter mode

One shared password, and nothing else to set up:

| Environment variable | What to enter |
| --- | --- |
| `LOPSI_ACCESS_PASSWORD` | The password visitors enter before they reach the crew. At least 16 characters; generate one with `openssl rand -base64 32`. |

Everyone with the password acts as the same identity, so they share chats and connection grants. Share it only with people who may see each other's work. Changing it signs everyone out.

### Production mode

Sign in with Vercel, limited to members of the project's Vercel team, with a separate identity per person. From a linked project, run:

```sh
pnpm setup:sign-in
eve deploy
```

The script does two things, and only what is missing, so re-running it is safe:

1. The same Vercel API calls as eve's own Sign in with Vercel setup: a Vercel App that only the project's team can sign in to, and `VERCEL_APP_CLIENT_ID`, `VERCEL_APP_CLIENT_SECRET` and `BETTER_AUTH_SECRET` for production and preview. When they're already set, it checks that the app is still team-only.
2. A private Vercel Blob store (`BLOB_STORE_ID`) that keeps each chat to the person who started it. Blob usage may incur charges.

Production mode starts only with both. Sign-in sessions last 8 hours and need no database, and the shared password is no longer accepted. Your role must be allowed to manage Vercel Apps, Blob stores and environment variables; otherwise a team owner can run it.

Don't use `eve add channel/web` for this: its files would replace the ones here that keep starter mode working.

### Who can see a chat

In production mode a chat belongs to the person who started it: a teammate with its link can't read it, add to it, or answer its approvals. eve doesn't do this on its own; the agent records each session's owner when its first turn starts and checks it on every request. In starter mode everyone shares one identity, so everyone with the password shares every chat. In production mode your chats are also kept on the server, in the same private Blob store: the list (written by the agent as you chat, so it's the same on every device) and each chat's transcript (saved by the chat as it grows), so an ended chat stays readable after eve deletes its run data. In starter mode the list is kept in each browser, per person, and doesn't follow you to another device.

### What the crew can reach

- Each chat's sandbox (its shell and files) has no network access on Vercel, so nothing the crew reads can make it send data anywhere from the shell. Locally eve uses just-bash, which can't restrict the network.
- `web_fetch` runs outside the sandbox, so it asks before every URL: a link built from chat or connector data could otherwise carry that data away.
- A chat stops and asks to continue after it spends `LOPSI_SESSION_BUDGET_USD` (default $1) on model calls since the last Continue. With a model that reports no cost, eve's token cap applies instead.

### Neither

A deployment with neither mode configured accepts no browser traffic, and the sign-in page says which variable to set. Locally, with neither configured, the chat opens without signing in.

## The crew

Each crew member is an eve agent in its own directory:

```text
agents/<name>/
  agent/        # the eve agent: agent.ts, instructions.md, tools/, connections/, …
  crew.json     # how the dashboard shows it: name, role, mascot, suggestions
  evals/        # optional
```

To add one, create the directory (start from `agents/lopsi/`), then run `pnpm crew` to regenerate the dashboard's crew list. `pnpm validate` fails if you forget. `crew.json` is described by `scripts/crew.schema.json`; an optional `order` sets its place in the crew list (lowest first, the rest by directory name). Without a `crew.json`, the agent still appears, named after its directory. Its chat lives at `/c/<name>`.

Each chat has its own sandbox. The **Computer** button in the chat header shows what it did: the shell commands it ran, with their output and exit codes, and the files the crew member wrote or read. In production mode the agent also snapshots the workspace after each turn that used the shell or wrote a file (small text files' content, every file's name and size, in the private Blob store), so files the shell made on its own show too.

## Settings

**Settings** in the sidebar (or the account menu on a phone) opens a dialog with three tabs:

- **Workspace**: the access mode, where chat history is kept, email, the per-chat budget, where pull requests go, and links to AI Gateway, Agent Runs and Vercel Connect.
- **Connectors**: which are set up, and the command for the rest.
- **Crew**: each crew member's effective setup from its deployed agent (model, tools and which ask first, connections, skills, schedules, subagents, hooks, sandbox, email address).

Changes open the dashboard's own dialogs: Connections, Pending changes, and a member's Edit.

## Changing the crew from the dashboard

Agents are code, so the dashboard never changes a running agent. **Edit** in a chat's menu (name, role, mascot, suggestions, order, model and instructions, plus which connectors the member may use, its built-in tools (shell, web search, web pages and how often they ask), and which domains its sandbox may reach) and **New crew member** in the sidebar each open a pull request against the branch this deployment was built from. Merging it deploys the change; **Pending changes** lists the open ones.

```sh
pnpm setup:connector github
```

This creates a GitHub App through Vercel Connect (`GITHUB_CONNECTOR`). Install it on the repository with read and write access to contents and pull requests. The repository and branch come from Vercel's Git variables; set `LOPSI_GITHUB_REPO` (`owner/repo`) and `LOPSI_GITHUB_BRANCH` to override them, as in local development.

- A pull request is a draft where GitHub allows one; it names who asked for it and lists the files it touches.
- An edit is refused if the crew member changed on the branch since the dialog opened.
- The model can be changed while `agent.ts` still has eve's generated shape; after a hand edit, change it there. Instructions must be a single `instructions.md`.
- A new crew member copies `agents/lopsi`'s channel and connections, and gets its own `agent.ts`, `instructions.md` and `crew.json`.

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
- **Settings → Integrations** lists the channels and their setup commands; **Crew** shows which member answers which.
- Beeper isn't offered: its adapter (0.2.0) can't be loaded by Node as published.

## Tech stack

| Layer | Technology |
| --- | --- |
| Agent framework | eve (workspace layout) |
| Frontend framework | Next.js |
| Sign-in | Better Auth with Sign in with Vercel (production mode) |
| Interface | Lopsi Bot's dashboard on Base UI, shadcn/ui and AI Elements |
| Deployment | Vercel Services |
| Models | Vercel AI Gateway |
| Sandbox | Vercel Sandbox |

## Local development

Use Node.js 24 and pnpm. Install the [Vercel CLI](https://vercel.com/docs/cli), then run:

```sh
pnpm install
vercel link
vercel env pull .env.local
pnpm dev:all
```

`pnpm dev:all` starts the chat and the agent together with `vercel dev`, routing each agent's `/eve/<name>/v1/*` routes to it the same way a deployment does. To chat with the agent in your terminal instead, run `pnpm dev:agent`.

To require the password locally, set it in `.env.local` (see `.env.example`).

## Checks

```sh
pnpm validate   # Ultracite, TypeScript, knip, eve info
pnpm build      # eve build, then the web app
pnpm eval --tag fast
```

Evals call real models through AI Gateway, so they need the project linked and its environment pulled.

## Project layout

See [ARCHITECTURE.md](ARCHITECTURE.md).

## License

Apache-2.0. See [LICENSE](LICENSE) and [NOTICE](NOTICE).
