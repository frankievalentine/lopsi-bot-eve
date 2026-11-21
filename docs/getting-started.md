# Getting started

From the Deploy button to a crew you can talk to, then the parts you add when you need them. Each step links to the page with the details.

## 1. Deploy

Click **Deploy** in the [README](../README.md#deploy). Vercel clones this repository into your GitHub account and deploys it, and asks for:

- **`LOPSI_ACCESS_PASSWORD`**: the password your visitors enter ([starter mode](access.md#starter-mode)). Use at least 16 characters, for example from `openssl rand -base64 32`.
- **`VERCEL_TOKEN`**: a [Vercel token](https://vercel.com/account/tokens) scoped to the team (not a single project), with an expiry, so Lopsi can see the services you add in Vercel Connect ([why](integrations.md#let-lopsi-see-your-connectors)). Only the server reads it.
- **A GitHub App connector**: install the app on your new repository, with read and write access to contents and pull requests, so the dashboard can open pull requests.
- **A private Blob store**, for what Lopsi keeps between chats, and **Upstash for Redis**, for email threads.

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

It creates a Vercel App only your team can sign in to and, if the project doesn't have one yet, a private Blob store. Deploy afterwards. Details: [docs/access.md](access.md#production-mode).

## 4. Shape the crew

Open the **…** menu in a crew member's chat and choose **Edit** to change its name, role, mascot, model, instructions, tools and connectors, or **New Crew Member** in the sidebar to add one. Each opens a pull request; merge it and Vercel deploys the change. **Pending Changes** lists the open ones. Details: [docs/crew.md](crew.md).

## 5. Add integrations

Open Settings → **Integrations** → **Add Connectors**. On the project's Connect page, create a connector for any service (Slack, Google, Stripe, Linear, Notion, …) and attach it to this project. It shows up in Settings within a minute, and the crew can use it, with no redeploy. Details: [Integrations](integrations.md).

| To | Do | Details |
| --- | --- | --- |
| Give the crew any service | Add its connector in Vercel Connect | [Services](integrations.md#services) |
| Chat with Lopsi in Slack or Telegram | Add the connector, then **Turn On** in Settings | [Chat in Slack or Telegram](integrations.md#chat-in-slack-or-telegram) |
| Let people email the crew | Add a Resend connector, then **Turn On** on its card | [Email](integrations.md#email) |

## 6. Check it

**Settings** in the sidebar shows how the deployment is set up: access, history, the budget per chat, which services are connected, and what each crew member has beyond its Edit form. Each chat's **Computer** button shows what its sandbox ran.
