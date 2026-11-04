# eve Agent App

This project uses the eve framework: an agent is a directory of files under `agent/`, and eve compiles and runs it.

For a content-only change to the root agent's identity, purpose, tone, or response guidelines, edit its existing authored instructions. Fresh projects use `agent/instructions.md`; a project may instead use `agent/instructions.ts` or files under `agent/instructions/`. You do not need to read the framework docs for a content-only instructions change. A fresh project already has its selected model in `agent/agent.ts`; preserve that file unless the user asks to change the model.

## Read the docs before writing code

```sh
ls node_modules/eve/docs
```

Start with `docs/README.md`: it maps each task to the page that covers it. Read that page before authoring tools, connections, channels, skills, subagents, schedules, or deployment. In a workspace or local package install, resolve the installed `eve` package location first. If the package docs are missing, use https://eve.dev/docs.

Use a bounded authoring loop:

1. Read the relevant page and inspect only files you will modify or need to imitate.
2. Stop discovery once the file location, imports, and definition shape are clear. Implement the smallest complete behavior the user requested.
3. Run one narrow verification. Expand investigation only when it fails or the request needs project-specific details.

Follow links or inspect public types only when the routed page leaves the task unanswered. Do not recursively glob `node_modules`, enumerate the entire docs tree, or read unrelated scaffold files when the direct path is known. Package-manager links can hide files from recursive glob tools even though direct reads work.

## Prefer an existing integration

When a task names an external product or service, search the registry before implementing its integration. For a generic capability, author a tool instead.

```sh
eve registry search <query> --json
eve registry view <item>
```

Prefer items whose `implementation` is `native`; use Chat SDK adapters when no native channel fits. `registry view` links the item's documentation.

Install without driving interactive prompts:

```sh
eve add <item> --non-interactive
```

Exit code 0 means setup completed, 1 failed, and 2 needs an answer or a prerequisite. On exit 2, run the `next.command` from the final NDJSON event. For a non-secret question, replace its `<JSON value>` answer placeholder with the answer you collected; string values need JSON quotes. Never pass a secret in `--answer`. See `docs/install-integrations.mdx` for setup prerequisites.

## Use eve for Vercel operations

Use eve to link and deploy Vercel projects:

```sh
eve link --non-interactive --project <name-or-id> [--team <team-id-or-slug>]
eve deploy --non-interactive --yes [--project <name-or-id>]
```

A setup may report `eve link` as a prerequisite; run it, then retry the continuation. When a completed setup event has `deploymentRequired: true`, run the `next` command it reports.

## Validate the change

Run the validation the task requests. When it does not establish the behavior you changed, run the narrowest relevant check.

## This project

- An eve workspace: agents live at `agents/<name>/agent/`, never a root `agent/` (eve treats a root `agent/` as single-agent). Pass `--agent <name>` to agent-scoped eve commands.
- The web app in `apps/web/` is a Next.js peer application; its dependencies are declared in the root `package.json`. Its interface is ported from Lopsi Bot (Base UI components); don't add Radix or eve's registry components.
- Adding a crew member: create `agents/<name>/` with `agent/` and `crew.json`, then run `pnpm crew`. Copy `agent/channels/eve.ts`, `agent/limits.ts`, `agent/sandbox.ts` and `agent/tools/` from `agents/lopsi/` unchanged: they carry both access modes, the chat owner check, the session budget, the sandbox's network policy and web_fetch approval. The dashboard's New crew member does the same.
- The dashboard opens pull requests for crew changes (`apps/web/lib/config-changes.ts`). Keep `agents/<name>/agent/agent.ts` in eve's generated shape (`defineAgent({ model, reasoning })`, optionally with `limits` imported from `./limits` and AI Gateway fallback models in `modelOptions.providerOptions.gateway.models`) if the dashboard should keep editing its model, and keep the fallbacks when changing the model, and crew rules in `apps/web/lib/crew-core.mjs`, which both `pnpm crew` and the dashboard use.
- Connectors live in `apps/web/lib/connectors.json`; an agent uses them through `agent/connections/services.ts`. Don't give a connection `never()` approval for tools that write.
- `apps/web/lib/auth.ts`, `apps/web/lib/access.ts` and `agents/*/agent/channels/eve.ts` carry both access modes. Don't run `eve add channel/web --overwrite`: it replaces them with versions that break starter mode. Production sign-in is set up with `pnpm setup:sign-in`.
- Use pnpm. New versions are held for a day by `minimumReleaseAge`; only the eve release train is excluded.
- Run `pnpm validate` before calling a change done. See `ARCHITECTURE.md` for the layout.
