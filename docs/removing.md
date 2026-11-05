# Removing a Project

## Pause it

To stop a deployment without losing anything, pause it: in Vercel, open the project's **Settings**, and on the **General** page select **Pause Project**. You can resume it later.

## Remove it from Settings

On a production deployment, open **Settings → General → Remove This Project**:

1. Paste a [Vercel token](https://vercel.com/account/settings/tokens). It's used for this removal only and never stored. Delete it afterward. A token for the project's team removes everything below. A token for only this project removes the project, and leaves its stores and connectors for you.
2. Review what will be removed, and uncheck anything you'd like to keep.
3. Type the project's name to confirm.

This can't be undone. The project goes last, so if something fails along the way, the site still works and you can try again.

A store or connector that another project also uses is kept and listed, never deleted.

## What's left for you

Settings lists these for your deployment when it's done. Deleting the project in Vercel's dashboard instead leaves all of this and the items above it, so go through the whole list:

| Item | Made by | Where to remove it |
| --- | --- | --- |
| Blob store, with chat history | `pnpm setup:sign-in` | Vercel: Storage |
| Connectors | `pnpm setup:connector`, the Deploy button | Vercel: Connect |
| GitHub repository | The Deploy button | GitHub: the repository's settings |
| GitHub App | The Deploy button | GitHub: [Applications](https://github.com/settings/installations) |
| Vercel App for sign-in | `pnpm setup:sign-in` | Vercel: team settings, Apps |
| Upstash for Redis store | `pnpm setup:email`, `pnpm setup:channel` | Vercel: Storage |
| Resend webhooks, API key, receiving domain | `pnpm setup:email` | [Resend](https://resend.com) |
| Channel webhooks | `pnpm setup:channel` | The provider's dashboard |

Upstash can keep billing on a paid plan, and a provider's webhooks keep firing at the old address until you remove them.
