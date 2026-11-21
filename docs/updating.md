# Updating

**Settings → General** shows your template version, and says when a newer release is out, marking security fixes. Your deployment doesn't change until you update it.

The Deploy button clones this repository rather than forking it, so your copy shares no history with it, and GitHub's Sync Fork button and a plain `git merge` won't work. An update instead compares three versions of each file: the template's at your release, the template's at the new one, and yours.

- A file the template changed and you didn't is updated: changed, added or deleted.
- A file you've changed too is **kept as you have it** and listed, with a link to the template's change, for you to apply by hand. Your work is never replaced.
- Crew members' shared files (channels, connections, hooks, tools, limits, memory, sandbox) follow Lopsi's: each member's copy is updated where it still matches the template's, keeping the member's own id.
- `crew.generated.ts` is rebuilt, and `template.json` records the new version.

Neither way below can set environment variables or run setup steps. Read the [release notes](https://github.com/frankievalentine/lopsi-bot-eve/releases) for every version you're skipping past: they say when an update needs one.

## From the dashboard

Click **Update** on the Version row in Settings → General. It opens a pull request on your repository with the new release, through the same GitHub connector the dashboard uses for crew changes, and lists what it left for you in the description. Check the Vercel preview, apply anything listed, and merge it.

Two things it can't do, which it lists instead:

- **GitHub Actions workflows** (`.github/workflows/`): the dashboard's GitHub App isn't allowed to change them. Apply those by hand.
- **Your lockfile**, if you've changed your dependencies: run `pnpm install` on the branch and commit `pnpm-lock.yaml`, or the deployment won't build.

## From a clone

The same update on your machine, on a new branch:

```sh
pnpm update:template 0.2.0
```

It needs a clean working tree. It fetches your release and the new one from the template into `refs/lopsi-template/` (not your tags), writes the changes on `update-template-v0.2.0`, stages them, and prints what it kept. Then:

```sh
pnpm install     # if package.json changed
pnpm validate
git commit -m "Update the template to v0.2.0"
```

Push the branch and open a pull request.

### Coming from a release without the command

Releases before v0.2.0 don't have `pnpm update:template`. Run the new release's copy instead. From your repository's root:

```sh
git fetch https://github.com/frankievalentine/lopsi-bot-eve.git refs/tags/v0.2.0:refs/lopsi-template/v0.2.0
mkdir -p ../lopsi-update && git archive refs/lopsi-template/v0.2.0 scripts/update-template.mjs apps/web/lib/template-update.mjs | tar -x -C ../lopsi-update
node ../lopsi-update/scripts/update-template.mjs 0.2.0
```

That takes the two files from the release tag, which you can read before running them, and needs nothing installed beyond Node.

## Following another repository

Settings and `pnpm update:template` follow the repository in `apps/web/lib/template.json`. Set `LOPSI_TEMPLATE_REPOSITORY` (`owner/name`) to follow another one, such as your own fork of the template; `pnpm update:template` also takes `--repo owner/name`.
