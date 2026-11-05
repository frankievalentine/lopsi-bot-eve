# Getting started

From the Deploy button to a crew you can talk to, then the parts you add when you need them. Each step links to the page with the details.

## 1. Deploy

Click **Deploy** in the [README](../README.md#deploy). Vercel clones this repository into your GitHub account and deploys it, and asks for:

- **`LOPSI_ACCESS_PASSWORD`**: the password your visitors enter ([starter mode](access.md#starter-mode)). Use at least 16 characters, for example from `openssl rand -base64 32`.
- **A GitHub App connector**: install the app on your new repository, with read and write access to contents and pull requests, so the dashboard can open pull requests.

When the deployment is ready, open it, enter the password, and chat with Lopsi.

## 2. Work on your copy

Clone the new repository and link it to the Vercel project, so the setup commands and local development can use it:

```sh
git clone <your repository>
cd <your repository>
pnpm install
vercel link
vercel env pull .env.local
```

Everything from here runs from this folder. See [docs/development.md](development.md) to run the dashboard and the crew locally.

## 3. Sign in with Vercel (recommended)

Starter mode gives everyone with the password the same identity and the same chats. For your team, switch to Sign in with Vercel: one identity per person, private chats, and history on every device.

```sh
pnpm setup:sign-in
```

It creates a Vercel App only your team can sign in to and a private Blob store. Deploy afterwards. Details: [docs/access.md](access.md#production-mode).

## 4. Shape the crew

Open **Edit** in a crew member's chat to change its name, role, mascot, model, instructions, tools and connectors, or **New Crew Member** in the sidebar to add one. Each opens a pull request; merge it and Vercel deploys the change. **Pending Changes** lists the open ones. Details: [docs/crew.md](crew.md).

## 5. Add integrations

Each is off until you set it up, and each has one command:

| To | Run | Details |
| --- | --- | --- |
| Give the crew tools from Linear, Notion, Sentry, Resend or any MCP service | `pnpm setup:connector <service>` | [Connectors](integrations.md#connectors) |
| Let people email the crew, and the crew send email | `pnpm setup:email` | [Email](integrations.md#email) |
| Reach the crew by SMS, iMessage, WhatsApp and more | `pnpm setup:channel <channel>` | [Channels](integrations.md#channels) |

Email and channels add [Upstash for Redis](../README.md#what-it-runs-on) the first time; the setup asks before it does. Commit any files a setup writes, then deploy.

## 6. Check it

**Settings** in the sidebar shows how the deployment is set up: access, history, email, the budget per chat, which connectors and channels are on, and each crew member's tools and channels. Each chat's **Computer** button shows what its sandbox ran.
