# Access

A deployment admits people in one of two modes. Production mode takes precedence when it is configured.

## Starter mode

One shared password, and nothing else to set up:

| Environment variable | What to enter |
| --- | --- |
| `LOPSI_ACCESS_PASSWORD` | The password visitors enter before they reach the crew. At least 16 characters; generate one with `openssl rand -base64 32`. |

After 10 wrong passwords from one address, that address waits 15 minutes. The count is kept in each server instance's memory, so it slows guessing rather than stopping it; the password's length is the real defense.

Everyone with the password acts as the same identity, so they share chats and connection grants. Share it only with people who may see each other's work. Changing it signs everyone out.

## Production mode

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

Adding a domain to the project? Redeploy afterward. Sign-in only trusts addresses the project had when it was deployed, and until then the new address shows a page saying so.

## Who can see a chat

In production mode a chat belongs to the person who started it: a teammate with its link can't read it, add to it, or answer its approvals. eve doesn't do this on its own; the agent records each session's owner when its first turn starts and checks it on every request. In starter mode everyone shares one identity, so everyone with the password shares every chat. In production mode your chats are also kept on the server, in the same private Blob store: the list (written by the agent as you chat, so it's the same on every device) and each chat's transcript (saved by the chat as it grows), so an ended chat stays readable after eve deletes its run data. In starter mode the list is kept in each browser, per person, and doesn't follow you to another device.

## What the crew can reach

- Each chat's sandbox (its shell and files) has no network access on Vercel, so nothing the crew reads can make it send data anywhere from the shell. Locally eve uses just-bash, which can't restrict the network.
- `web_fetch` runs outside the sandbox, so it asks before every URL: a link built from chat or connector data could otherwise carry that data away.
- A chat stops and asks to continue after it spends `LOPSI_SESSION_BUDGET_USD` (default $1) on model calls since the last Continue. With a model that reports no cost, eve's token cap applies instead.

## Neither

A deployment with neither mode configured accepts no browser traffic, and the sign-in page says which variable to set. Locally, with neither configured, the chat opens without signing in.
