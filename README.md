# Lopsi Bot for eve

A crew of [eve](https://eve.dev) agents with the Lopsi Bot dashboard, deployed on Vercel. Each crew member is an eve workspace agent under `agents/<name>/`, and the web chat in `apps/web/` talks to it over that agent's routes (`/eve/<name>/v1`).

Status: early. Both access modes, the Lopsi dashboard (crew list, chat, approvals and questions), connectors and configuration by pull request work.

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

In production mode a chat belongs to the person who started it: a teammate with its link can't read it, add to it, or answer its approvals. eve doesn't do this on its own; the agent records each session's owner when its first turn starts and checks it on every request. In starter mode everyone shares one identity, so everyone with the password shares every chat. The list of chats is kept in each browser, per person; it doesn't follow you to another device.

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

## Changing the crew from the dashboard

Agents are code, so the dashboard never changes a running agent. **Edit** in a chat's menu (name, role, mascot, suggestions, order, model and instructions) and **New crew member** in the sidebar each open a pull request against the branch this deployment was built from. Merging it deploys the change; **Pending changes** lists the open ones.

```sh
pnpm setup:connector github
```

This creates a GitHub App through Vercel Connect (`GITHUB_CONNECTOR`). Install it on the repository with read and write access to contents and pull requests. The repository and branch come from Vercel's Git variables; set `LOPSI_GITHUB_REPO` (`owner/repo`) and `LOPSI_GITHUB_BRANCH` to override them, as in local development.

- A pull request is a draft where GitHub allows one; it names who asked for it and lists the files it touches.
- An edit is refused if the crew member changed on the branch since the dialog opened.
- The model can be changed while `agent.ts` still has eve's generated shape; after a hand edit, change it there. Instructions must be a single `instructions.md`.
- A new crew member copies `agents/lopsi`'s channel and connections, and gets its own `agent.ts`, `instructions.md` and `crew.json`.

## Connectors

The crew can use Linear, Notion and Sentry through their MCP servers and [Vercel Connect](https://vercel.com/docs/connect). None is on until you set it up, so the agent never reaches for a service it can't use:

```sh
pnpm setup:connector linear   # or notion, sentry
eve deploy
```

The script creates a Vercel Connect connector for the service, attaches it to the project and stores its UID in `LINEAR_CONNECTOR` (or `NOTION_CONNECTOR`, `SENTRY_CONNECTOR`). The first time the crew needs the service, it asks you in the chat to connect your own account. In starter mode everyone shares one connection.

- Tools the service marks read-only run straight away; every other call waits for your approval.
- **Connections** in the sidebar shows which services you've connected, and disconnects one by revoking your grant at Vercel Connect.
- To add another service, add an entry to `apps/web/lib/connectors.json` (its MCP URL and a variable name).

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
