# ARCHITECTURE.md

A map of how this project is put together, for humans and AI agents working in the repo. Keep it current as the codebase evolves.

## Overview

Lopsi Bot for eve is an eve workspace: every root agent is a directory under `agents/`, and its directory name is its name in the CLI and in its public routes (`/eve/<name>/v1/*`). The web app in `apps/web/` is a Next.js peer application, not a workspace member. The agents and the web app deploy together on Vercel as separate services, configured in `vercel.ts` with `withEve`.

eve discovers every capability from the filesystem under each `agents/<name>/agent/`. There is no central registry: a tool's name is its filename, a connection's name is its filename, a subagent's name is its directory.

## Project structure

```text
agents/
  lopsi/
    agent/
      agent.ts              # defineAgent: model, reasoning, limits, AI Gateway fallback models
      instructions.md       # always-on system prompt
      limits.ts             # spend per chat window before it asks to continue (LOPSI_SESSION_BUDGET_USD)
      memory.ts             # production mode: what it remembers about each person (eve's fileMemory, private Blob)
      sandbox.ts            # each chat's sandbox and its network policy
      channels/
        eve.ts              # inbound route auth for /eve/lopsi/v1; checks each chat's owner (hooks/chats.ts records it)
        slack.ts            # Slack, through an attached Slack connector's forwarded events
        telegram.ts         # Telegram, the same way, for the people Settings allows
        resend.ts           # email, from app/api/email, through the Resend connector
      connections/
        services.ts         # one MCP connection per attached MCP connector (defineDynamic)
      hooks/
        chats.ts            # production mode: records each session's owner and the person's chat list
        network.ts          # applies the current sandbox network policy to open chats
        workspace.ts        # production mode: workspace snapshots after turns that change files
      tools/
        call_service.ts     # any other attached connector's HTTP API, credential added on the server
        web_fetch.ts        # eve's web_fetch, asking before every URL
    crew.json               # how the dashboard shows this agent (scripts/crew.schema.json)
    evals/
      evals.config.ts       # run-wide eval defaults
      smoke.eval.ts         # a greeting succeeds without shell commands
      web-fetch/            # web_fetch asks first, a denial never runs, a page can't trigger another fetch (stubbed pages)
apps/
  web/                      # Next.js dashboard (started from `eve add channel/web`)
    app/
      _components/
        crew-page.tsx       # server: access check, then the dashboard or a sign-in
        crew-app.tsx        # the shell: crew list beside the chat; phones one at a time
        connections-dialog.tsx, connections-actions.ts   # Connections: status and disconnect
        member-config-dialog.tsx, pending-changes-dialog.tsx, config-actions.ts   # changes by pull request
        crew-list.tsx       # sidebar and phone list (ported from Lopsi Bot)
        crew-chat.tsx       # one chat on useEveAgent: header, messages, composer
        computer-panel.tsx  # the chat's sandbox: commands and files, from its tool calls
        eve-message.tsx     # eve message parts drawn with Lopsi's components
        sign-in-with-vercel.tsx
        settings-dialog.tsx, settings-actions.ts   # Settings: access, integrations, allowlists, email, budget
        remove-project-dialog.tsx, remove-project-actions.ts   # Settings' Remove This Project
      api/auth/[...all]/    # Better Auth routes; 404 unless production mode is configured
      api/chats/[sessionId]/   # transcript/ and workspace/: a chat's saved transcript and workspace snapshot, for its owner
      api/email/route.ts    # received email from the Resend connector, handed to each addressed member
      c/[agent]/            # /c/<agent> (new chat) and /c/<agent>/s/<sessionId>
      login/                # starter-mode password sign-in and sign-out (server actions)
      page.tsx              # / : the crew
    components/
      ai-elements/          # AI Elements on Base UI, from Lopsi Bot
      ui/                   # shadcn/ui base-nova (Base UI), from Lopsi Bot
      mascot.tsx, crew-icon.tsx, l-mark.tsx   # Lopsi Bot's mascots and mark
    lib/
      access.ts             # access mode and starter-mode password access, shared with the agents
      auth.ts               # Better Auth with Sign in with Vercel, shared with the agents
      agent-model.ts        # reads and rewrites the model in a generated agent.ts
      chat-history.ts       # each person's chat list in the browser, merged with the server's
      chat-store.ts         # production mode: chat list and transcripts in private Blob
      computer-activity.ts  # bash, edit_file, write_file and read_file calls as commands and files
      workspace-store.ts    # production mode: workspace snapshots in private Blob
      agent-info.ts         # each member's effective setup, from its operator-only /info route
      session-budget.ts     # LOPSI_SESSION_BUDGET_USD, read by the agent's limits.ts and Settings
      project-removal.ts    # Settings' Remove This Project: what's this project's alone, then removing it with a pasted Vercel token
      config-changes.ts     # a dashboard edit as the files of one pull request
      crew-core.mjs         # crew.json rules and crew.generated.ts, shared with scripts/crew.mjs
      github.ts             # repository, Connect GitHub token, reading files, opening pull requests
      connectors.ts         # the connectors attached in Vercel Connect (VERCEL_TOKEN), chat routing, grant subjects
      approval-mode.ts      # crew.json `approvals` as eve approval policies for services (always, once, auto, never)
      approval-labels.ts    # how the dashboard names those modes
      connector-domains.ts  # hosts each API connector's credential may go to (private Blob)
      allowed-senders.ts    # who may email the crew or message its Telegram bot, edited in Settings (private Blob)
      email.ts              # email addresses, Redis for threads, the DMARC check
      channel-guard.ts      # the gate in front of the Resend channel
      password-attempts.ts  # starter mode: failed sign-ins per address, per instance
      production-mode.ts    # whether Sign in with Vercel is configured
      template-version.ts   # Settings' Version row and update check (template.json, LOPSI_TEMPLATE_REPOSITORY)
      template-update.mjs   # a template update as a plan: what to update, what to keep; shared with scripts/update-template.mjs
      template-update-github.ts   # Settings' Update button: the plan from the GitHub API, as a pull request's files
      demo.ts, demo-script.ts, demo-icons.ts   # the demo (NEXT_PUBLIC_LOPSI_DEMO=1): Deploy button, scripted replies, sample connector icons
      member-access.ts      # the bash, web_search, web_fetch and sandbox.ts templates the dashboard writes
      vercel-project.ts     # this deployment's project and team, from its OIDC token
      current-account.ts    # who is making a request, on the server
      session-owners.ts     # who started each session (private Blob), and the owner check
      crew.generated.ts     # generated by `pnpm crew` from agents/*/crew.json
scripts/
  crew.mjs                  # generates the crew list; --check in `pnpm validate`
  setup-sign-in.mjs         # production mode: team-only Vercel App, its credentials, the chat owner store
  update-template.mjs       # `pnpm update:template`: a template update on a new branch, through git
  vercel-api.mjs            # helpers for setup-sign-in.mjs
vercel.ts                   # Vercel Services: the web service and the eve agents
```

## Access modes

`accessMode()` in `apps/web/lib/access.ts` picks one, in this order:

| Mode | When | Who gets in |
| --- | --- | --- |
| `vercel` | `VERCEL_APP_CLIENT_ID`, `VERCEL_APP_CLIENT_SECRET`, `BETTER_AUTH_SECRET` and the chat owner store (`BLOB_STORE_ID` or `BLOB_READ_WRITE_TOKEN`) are all set | Members of the project's Vercel team, each as themselves, each chat to its owner |
| `incomplete` | Sign-in is set but the chat owner store isn't | Nobody: the sign-in page says to run `pnpm setup:sign-in` |
| `password` | `LOPSI_ACCESS_PASSWORD` has at least 16 characters | Anyone with the password, all as `lopsi:operator` |
| `too-short` | The password is shorter | Nobody |
| `open` | Local development with neither | Anyone on localhost |
| `unconfigured` | A deployment with neither | Nobody |

## Data flow

1. The browser loads a page from the `web` service. `crew-page.tsx` checks the mode and the browser's session or cookie, then renders the dashboard, Sign in with Vercel, or a redirect to `/login`.
2. Selecting a crew member opens `/c/<agent>`, or its current chat from the browser's chat list. The chat calls `useEveAgent({ agent })` from `eve/react`, which creates or resumes a session on `/eve/<agent>/v1/session` and reads its event stream. A new session's id replaces the URL (`/c/<agent>/s/<id>`) without a router navigation, which would remount the chat and detach its stream.
3. `agents/lopsi/agent/channels/eve.ts` authenticates each request before the agent sees it.
4. The agent runs the turn as a durable Vercel Workflow, calls models through AI Gateway, and runs commands in a Vercel Sandbox.
5. Approvals and questions arrive as interactions in the stream; the chat answers them with `agent.respond`. A connection asking the person to sign in shows as a connect card.
6. When a reply finishes, the chat records a preview in the browser's chat list, which the crew list shows.
7. In production mode the agent's `hooks/chats.ts` keeps each person's chat list in the private Blob store (`lopsi/chats/<owner hash>/<session>.json`: title from the first message, preview from each reply), and the chat saves its transcript (eve's events and session cursor, unchanged) to `/api/chats/<id>/transcript` as it grows, at most every 3 seconds while a reply streams. `crew-page.tsx` loads the list and, for the chat's owner, the transcript, which `useEveAgent` gets as `initialEvents` and `initialSession`. eve deletes a private session's run data when it ends; the transcript keeps the chat readable, and the chat says it has ended.

## Security considerations

- **Route auth** (`agents/<name>/agent/channels/eve.ts`), in order: the Better Auth session (production mode only); Vercel OIDC for this deployment's own runtime callers and per-person eve CLI tokens, which get the chat owner check in production mode (project tokens from another environment, such as a pulled development token, are refused); `localDev()` for localhost during development only, which may also stub tools so local evals need no network; `accessCookieAuth()` for the starter-mode cookie (skipped in production mode); `placeholderAuth()` rejects everything else. A deployment with neither mode configured accepts no browser traffic.
- **Production mode**: the Vercel App is created with `signInFrom: "owning-team"`, so Vercel itself refuses sign-in to anyone outside the project's team. Better Auth is stateless (an encrypted cookie, 8-hour sessions, no refresh), so there is no database. While production mode is configured, a leftover `LOPSI_ACCESS_PASSWORD` admits nobody: password checks, token minting and token verification all refuse. Without its credentials, `lib/auth.ts` builds an instance with throwaway secrets and a reserved host, so a starter deployment and a local `next build` work, and its routes answer 404.
- **Starter mode** (`apps/web/lib/access.ts`): the password is compared in constant time; the cookie is httpOnly, `SameSite=Lax`, and holds an HS256 token whose key is derived from the password. Every holder is the single principal `lopsi:operator`, so sessions and connection grants are shared. Passwords shorter than 16 characters are treated as unset. Cross-site requests are rejected even with a valid cookie. Failed sign-ins are limited per address in each instance's memory (`password-attempts.ts`: 10 in 15 minutes), so the 16-character floor remains the real defense.
- **Agent reach** (`agents/<name>/agent/`): `sandbox.ts` opens each session's sandbox with `networkPolicy: "deny-all"` on Vercel (its `prepare` makes the build capture a snapshot, so sandboxes start without setup); eve applies that policy only when it creates a sandbox and a resumed one keeps it, so `hooks/network.ts` applies the deployment's current policy (`networkPolicy()` from `sandbox.ts`) before a chat's first shell command and after any change, cancelling the turn if it can't, so narrowing the domains reaches chats already open; `tools/web_fetch.ts` wraps eve's web_fetch, which runs in the app outside that policy, with `always()` approval; `limits.ts` caps spend per window at `LOPSI_SESSION_BUDGET_USD`.
- **Page guards**: chat pages check access on the server before rendering; `/login` only accepts same-origin `redirect` targets (`safeRedirect`). An open chat whose access lapses redirects on its next 401 (`useSignInRedirect`).
- **Session ownership** (`apps/web/lib/session-owners.ts`): eve admits any caller the channel accepts to any session whose id it has, and its docs leave binding sessions to their owner to the app. In production mode the agent's `hooks/chats.ts` `turn.started` hook stores the session's initiator in a private Blob store (one JSON document per session, under `lopsi/session-owners/`), and the Better Auth step of route auth refuses a request about a session another person started (`ForbiddenError`). Owners are cached per instance. Requests about a session with no owner yet pass: eve records the owner when the first turn starts, and before that the session holds no conversation. Malformed session ids are refused before they reach a Blob pathname. Approving or cancelling a call is already limited by eve to the caller whose turn asked for it. Starter mode has one identity, so there is nothing to bind.
- **Connectors** (`apps/web/lib/connectors.ts`): every connector attached to the project in Vercel Connect, listed with `VERCEL_TOKEN` (a deployment's OIDC token can fetch a connector it knows but can't list them) and cached for 30 seconds, so one attached in Vercel is used without a redeploy. The token is read on the server only. An MCP connector becomes an MCP connection whose read-only tools run and the rest follow the member's approval mode; any other connector is an API credential for `call_service`, which adds it on the server, sends it only to hosts a person approved for that connector (`connector-domains.ts`), lets reads run and sends changes through the member's approval mode, and doesn't follow redirects. A connector that supports per-person grants is used as the person asking (`connect()` with the turn's user principal; eve never reuses one person's token for another); any other uses the connector's own credential (`principalType: "app"`). Tools an MCP server marks `readOnlyHint` run; every other call, including tools without annotations, follows the member's approval mode. The dashboard checks and revokes a person's grant on the server with the same subject `connect()` derives (`grantSubject`).
- **Slack and Telegram** (`agents/lopsi/agent/channels/`): eve's native channels with the connector's bot token, found when a message arrives. Connect verifies the provider and forwards each event with a Vercel OIDC token, which `createConnectWebhookVerifier()` checks, so the deployment holds no provider secret. Settings points the connector's trigger at `/eve/<member>/v1/<service>`. Telegram answers only private chats from the people Settings allows (`allowed-senders.ts`); Slack, anyone in the workspace that installed the app.
- **Email's gate** (`apps/web/lib/channel-guard.ts`): `guardChannel()` registers the Resend channel's handlers: a message reaches the agent only when the channel is on and `accept` (which may be async) takes it, the thread is subscribed only then, and the turn runs as the sender. Thread state is in Redis while email is on, in memory while it's off (`channelState()`).
- **Approval modes** (`apps/web/lib/approval-mode.ts`): a member's `crew.json` `approvals` picks one of eve's approval helpers for changes in connected services: `always()` (the default), `once()` (eve remembers an OK for that tool for the rest of the chat), `auto()` (eve's decision model, through AI Gateway with `zeroDataRetention`, asks a person when it flags a call or fails) or `never()`. Reads run in every mode, and the policies return eve's status unchanged so `once()` can remember its own prompts. `call_service`'s first call to a website nobody approved for the connector asks whatever the mode, so the mode never widens where a credential goes. eve's agent-wide `approval` can only add gates, so the mode lives in each tool and connection, not in `agent.ts`. The chat's **Approve all** answers several waiting approvals in one message, which eve accepts; each is still answered and recorded on its own.
- **Member settings by pull request** (`apps/web/lib/member-access.ts`): built-in tools are on unless `agent/tools/<tool>.ts` is eve's `disableTool()`; `web_fetch.ts` asks before every URL (`always()`) or once per chat (`once()`, after which that chat's fetches don't ask); `sandbox.ts` reaches only its `ALLOWED_DOMAINS` on Vercel (empty is `deny-all`). Each file is written from a template and read back only when it matches it exactly (or, for `sandbox.ts`, the earlier template without the `networkPolicy` export), so a hand-edited file is shown read-only, never rewritten. Turning a tool back on deletes its file (a Git tree entry with `sha: null`). `crew.json` `connectors` limits which connectors `services.ts` and `call_service.ts` give the member.
- **Email** (`agents/<name>/agent/channels/resend.ts`, `apps/web/lib/email.ts`, `apps/web/app/api/email/route.ts`): eve's Chat SDK channel with Resend's adapter, whose API key comes from the Resend connector Settings turned email on with, and thread state in Redis. Connect verifies Resend's signature and forwards each received email to `/api/email` with a Vercel OIDC token; the route checks it and hands the email to each member it's addressed to (`/eve/<member>/v1/resend`) with the deployment's own OIDC token, which the channel's `createConnectWebhookVerifier()` accepts. One route serves the whole crew, since Connect sends a connector's events to at most three places. A message reaches the agent only when it's addressed to the member, its sender is allowed (`apps/web/lib/allowed-senders.ts`: Settings' list in Blob, plus `LOPSI_EMAIL_SENDERS`), and an `Authentication-Results` header shows `dmarc=pass` for the sender's domain (only from `LOPSI_EMAIL_AUTHSERV_ID`'s server when set); anything else is dropped without a reply. The turn runs as the sender (`resend:email`), so sign-ins and approvals go only to them, and `hooks/chats.ts` records them as the session's owner, so nobody can open an email session from the dashboard. Turning email on saves `LOPSI_EMAIL_DOMAIN` and redeploys, because the adapter's From address is fixed when it's built.
- **Workspace snapshots** (`agents/<name>/agent/hooks/workspace.ts`, `apps/web/lib/workspace-store.ts`): after a turn that used `bash`, `edit_file` or `write_file` (others leave the sandbox asleep), the hook lists the workspace (skipping `.eve/`, `node_modules/`, `.git/`; up to 500 files) and keeps text files up to 128 KB, 1.5 MB in all, in one document per chat. Production mode and user-started sessions only; a failure never fails the turn. `/api/chats/<id>/workspace` serves it to the chat's owner only. What the agent writes there may be sensitive, which is why it lives with the chat's other private data.
- **Memory** (`agents/<name>/agent/memory.ts`): eve's `fileMemory()`, one document per person (`byPrincipal`) per member (eve's default namespace), in the private Blob store, under eve's `eve/memory/file` prefix. Production mode only: starter mode's single identity would make it one shared memory, and on Vercel without a store a failing recall fails the turn. The model saves and removes entries with `memory__save_memory` and `memory__remove_memory`; recalled entries reach it as user messages, not instructions. An email or channel sender is a different principal, so a different memory.
- **Chat history** (`apps/web/lib/chat-store.ts`): list records sit under a SHA-256 hash of the owner (authenticator and principal id), so ids never shape a Blob pathname and one person's folder can't be guessed from another's id. The hook records only user-initiated sessions in production mode, and a storage error never fails a turn. `/api/chats/<id>/transcript` accepts a save only from the chat's recorded owner, same-origin, up to 4 MB; transcripts load only for the owner. The browser only ever grows the saved copy, one save at a time.
- **Changes by pull request** (`config-actions.ts`, `config-changes.ts`, `github.ts`): the dashboard never changes a running agent. Server actions re-check the caller (production or starter mode; local development has none), validate every field with zod, build the files from the branch, and open a pull request with the GitHub App's installation token from Vercel Connect, which never reaches the browser. Edits carry the values they were made from and are refused if the branch has moved on underneath them. agent.ts is rewritten only in eve's generated shape, and model ids are checked before they're written into code. Merging stays with people in GitHub.
- **Template updates** (`template-update.mjs`, `template-update-github.ts`, `scripts/update-template.mjs`): an update replaces only files whose content hash still matches the template's at the repository's release, so nothing a person changed is overwritten; the rest is listed. The dashboard reads the template's release trees through the GitHub API (with the installation token, or without one for a public template) and its files from raw.githubusercontent.com, and opens the result as a pull request like any other change. It never writes `.github/workflows/`, which the GitHub App isn't permitted to change. `LOPSI_TEMPLATE_REPOSITORY` changes which repository is followed; the template is trusted code either way, and merging stays with people.
- **Setup script** (`setup-sign-in.mjs`): runs Vercel API calls through the Vercel CLI's login; request bodies, including secrets, go on stdin and are never printed.
- **Supply chain**: `pnpm-workspace.yaml` holds new package versions for a day (`minimumReleaseAge`), except the eve release train (`eve`, `nitro`, `workflow`, `@workflow/*`, `@vercel/*`, `ai`, `@ai-sdk/*`), which ships together and is pinned or ranged in `package.json`.

## Development and testing

- `pnpm dev:all`: chat and agent together under `vercel dev` (one per project at a time).
- `pnpm dev:agent`: the agent in eve's terminal UI.
- `pnpm typecheck`: the agents (root `tsconfig.json`) and the web app (`apps/web/tsconfig.json`).
- `pnpm crew`: regenerates `apps/web/lib/crew.generated.ts` after a `crew.json` or agent directory changes.
- `pnpm check` / `pnpm fix`: Ultracite (Biome). Vendored components, files copied unchanged from Lopsi Bot, generated files and `next-env.d.ts` are excluded.
- `pnpm knip`: unused files, exports and dependencies.
- `pnpm validate`: the crew list check, Ultracite, typecheck, knip, tests and `eve info`.
- `pnpm eval`: the lopsi agent's evals; they call real models.

## Glossary

- **Workspace member**: a root agent at `agents/<name>/agent/`, separately addressable by name.
- **Crew member**: a workspace member as the dashboard shows it, from its `crew.json`.
- **Channel**: an inbound surface. Here, the web (eve) channel with its route auth, email (Resend), and Lopsi's Slack and Telegram.
- **Starter mode**: shared-password access (Settings shows **Shared Password**); the default after Deploy with Vercel.
- **Production mode**: Sign in with Vercel for the project's team, set up with `pnpm setup:sign-in`.
- **Vercel Services**: the deployment model that runs the web app and the agents as separate services in one project.
