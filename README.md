<img alt="Lopsi Bot" height="96" src="apps/web/public/l-mark.svg" width="96">

# Lopsi Bot

An [eve](https://eve.dev) template for Vercel: a crew of AI agents, each with its own instructions, tools and model, and the Lopsi Bot dashboard to talk to them.

**[Try the demo](https://lopsi-bot.vercel.app)**: an example crew with scripted replies, so no sign-in and no model.

![The Lopsi Bot dashboard: a crew of six agents in the sidebar, a chat with Lopsi open](docs/images/dashboard.png)

<img alt="Lopsi" height="56" src="docs/images/crew/skipper.svg" width="56"> <img alt="Scout" height="56" src="docs/images/crew/lookout.svg" width="56"> <img alt="Purser" height="56" src="docs/images/crew/purser.svg" width="56"> <img alt="Navigator" height="56" src="docs/images/crew/navigator.svg" width="56"> <img alt="Deckhand" height="56" src="docs/images/crew/deckhand.svg" width="56"> <img alt="Signal" height="56" src="docs/images/crew/signal.svg" width="56">

## What you get

- **A crew of eve agents.** Each member is an eve agent under `agents/<name>/`, with a mascot, a role and its own chats. It starts with Lopsi; add more from the dashboard.
- **A dashboard to work with them.** Chat with tool runs, approvals and questions; a computer panel showing each chat's sandbox; chat history on every device; Settings.
- **Changes by pull request.** Edit a crew member's name, model, instructions, tools or connectors in the dashboard, and it opens a pull request. Nothing changes until you merge it.
- **Integrations.** Connectors (Linear, Notion, Sentry, Resend, or any MCP service), email to and from the crew, and messaging channels (SMS, iMessage, WhatsApp and more).
- **Safe by default.** A shared password to start, or Sign in with Vercel for your team. The shell has no network, and anything that changes something asks first.

## Deploy

[![Deploy with Vercel](https://vercel.com/button)](https://vercel.com/new/clone?repository-url=https%3A%2F%2Fgithub.com%2Ffrankievalentine%2Flopsi-bot-eve&project-name=lopsi-bot&repository-name=lopsi-bot&env=LOPSI_ACCESS_PASSWORD&envDescription=The%20password%20your%20crew%27s%20visitors%20enter.%20At%20least%2016%20characters%3B%20generate%20one%20with%3A%20openssl%20rand%20-base64%2032&envLink=https%3A%2F%2Fgithub.com%2Ffrankievalentine%2Flopsi-bot-eve%2Fblob%2Fmain%2Fdocs%2Faccess.md%23starter-mode&connect=%5B%7B%22type%22%3A%22github%22%2C%22env%22%3A%22GITHUB_CONNECTOR%22%7D%5D)

The button clones this repository into your GitHub account and deploys it. It asks for a password for [starter mode](docs/access.md#starter-mode) and adds a GitHub App connector so the dashboard can open pull requests; install the app on your new repository with contents and pull requests access.

Then add what you need, from a clone of your repository linked to the project (`vercel link`):

| Command | Adds |
| --- | --- |
| `pnpm setup:sign-in` | [Sign in with Vercel](docs/access.md#production-mode) for your team, one identity per person |
| `pnpm setup:connector <service>` | [Connectors](docs/integrations.md#connectors) |
| `pnpm setup:email` | [Email](docs/integrations.md#email) to and from the crew |
| `pnpm setup:channel <channel>` | [Messaging channels](docs/integrations.md#channels) |

## What it runs on

| For | It uses | Added by |
| --- | --- | --- |
| The crew's models | [AI Gateway](https://vercel.com/docs/ai-gateway) (the free tier works) | Nothing: the deployment's OIDC token |
| Dashboard pull requests | A [Vercel Connect](https://vercel.com/docs/connect) GitHub App connector | The Deploy button |
| Sign in with Vercel, private chats, chat history, workspace snapshots | A private [Vercel Blob](https://vercel.com/docs/vercel-blob) store | `pnpm setup:sign-in` |
| Email and messaging channels | [Upstash for Redis](https://vercel.com/marketplace/upstash), for conversation threads | `pnpm setup:email`, `pnpm setup:channel` |

## Stack

| | |
| --- | --- |
| Agents | [eve](https://eve.dev) (workspace layout, one agent per crew member), [Vercel Sandbox](https://vercel.com/docs/vercel-sandbox) for each chat's shell |
| Models | [AI SDK](https://ai-sdk.dev) through [AI Gateway](https://vercel.com/docs/ai-gateway) |
| Web app | [Next.js](https://nextjs.org) on [Vercel Services](https://vercel.com/docs/services) |
| Interface | Lopsi Bot's dashboard on [AI Elements](https://ai-sdk.dev/elements), [shadcn/ui](https://ui.shadcn.com) and [Base UI](https://base-ui.com), with Tailwind CSS |
| Sign-in | [Better Auth](https://better-auth.com) with Sign in with Vercel |
| Integrations | [Vercel Connect](https://vercel.com/docs/connect) for connectors, [Chat SDK](https://chat-sdk.dev) adapters for email and channels |
| Storage | [Vercel Blob](https://vercel.com/docs/vercel-blob), [Upstash for Redis](https://vercel.com/marketplace/upstash) |

## Documentation

- [docs/getting-started.md](docs/getting-started.md): from Deploy to a working crew, step by step.
- [docs/access.md](docs/access.md): starter mode and Sign in with Vercel, who can see a chat, what the crew can reach.
- [docs/integrations.md](docs/integrations.md): connectors, email and messaging channels.
- [docs/crew.md](docs/crew.md): adding crew members, Settings, changing the crew from the dashboard.
- [docs/development.md](docs/development.md): running locally and checks.
- [ARCHITECTURE.md](ARCHITECTURE.md): how it fits together, and the security model.

## License

Apache-2.0. See [LICENSE](LICENSE) and [NOTICE](NOTICE).
