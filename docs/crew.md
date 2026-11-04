# The crew

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
- A new crew member copies `agents/lopsi`'s web and email channels, connections, hooks, tools, session budget and sandbox, and gets its own `agent.ts`, `instructions.md` and `crew.json`. Messaging channels stay with the member set up to answer them.
