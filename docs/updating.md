# Updating

**Settings → General** shows your template version, and says when a newer release is out, marking security fixes. Your deployment doesn't change until you update it.

The Deploy button clones this repository rather than forking it, so your copy shares no history with it, and GitHub's Sync Fork button and a plain `git merge` won't work. Apply the changes between two versions instead.

## Apply an update

From a clone of your repository, with your version and the new one from Settings:

```sh
git remote add template https://github.com/frankievalentine/lopsi-bot-eve.git
git fetch template --tags
git checkout -b update-template
git diff v0.1.0 v0.2.0 -- . ':(exclude)agents' ':(exclude)apps/web/lib/crew.generated.ts' | git apply --3way
```

You only need `git remote add` once. This keeps your crew, and applies everything else:

- A file only the template changed updates as is.
- A file you both changed gets conflict markers for you to resolve. Your version is never silently replaced.

## Check and finish

1. Read the [release notes](https://github.com/frankievalentine/lopsi-bot-eve/releases) for each version you're skipping past. They say if an update needs a new variable or setup step.
2. If `package.json` changed, run `pnpm install`, which updates the lockfile.
3. Run `pnpm validate`, commit, and open a pull request. Merge it once its checks and Vercel preview look right.

## Crew members

Because `agents/` is left out, a fix to a crew member's files isn't applied by the command above. The release notes call these out. To see what changed, including for tools and hooks that each member has its own copy of:

```sh
git diff v0.1.0 v0.2.0 -- agents
```

Apply what's relevant to each member by hand.
