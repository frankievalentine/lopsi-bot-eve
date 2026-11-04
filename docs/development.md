# Development

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

See [ARCHITECTURE.md](../ARCHITECTURE.md).

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
