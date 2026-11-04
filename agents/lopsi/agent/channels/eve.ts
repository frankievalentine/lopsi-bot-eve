import {
  type AuthFn,
  localDev,
  placeholderAuth,
  vercelOidc,
} from "eve/channels/auth";
import { eveChannel } from "eve/channels/eve";
import { accessCookieAuth } from "../../../../apps/web/lib/access.js";
import {
  auth,
  isVercelSignInConfigured,
} from "../../../../apps/web/lib/auth.js";
import {
  isSessionOwnerStoreConfigured,
  recordSessionOwner,
  requireSessionOwner,
} from "../../../../apps/web/lib/session-owners.js";

/** Production mode needs both: team sign-in, and a store binding chats to their owners. */
const productionMode = () =>
  isVercelSignInConfigured && isSessionOwnerStoreConfigured();

const betterAuthSession: AuthFn<Request> = async (request) => {
  if (!productionMode()) {
    return null;
  }
  const session = await auth.api.getSession({ headers: request.headers });
  if (!session) {
    return null;
  }

  const attributes: Record<string, string> = {
    email: session.user.email,
    name: session.user.name,
  };
  if (session.user.image) {
    attributes.picture = session.user.image;
  }

  const caller = {
    attributes,
    authenticator: "better-auth:vercel",
    principalId: session.user.id,
    principalType: "user",
  };
  // A teammate with a chat's link still can't read or post to it.
  await requireSessionOwner(request, caller);
  return caller;
};

export default eveChannel({
  auth: [
    // Production mode: Sign in with Vercel, limited to the project's team.
    betterAuthSession,
    // Lets the eve TUI and your Vercel deployments reach the deployed agent.
    vercelOidc(),
    // Open on localhost for `eve dev` and the REPL; ignored in production.
    localDev(),
    // Starter mode: the shared access password's cookie; skipped in production mode.
    accessCookieAuth(),
    // Rejects everything else, so a deployment with neither mode configured
    // accepts no browser traffic.
    placeholderAuth(),
  ],
  events: {
    // Production mode: remember who started each session, for requireSessionOwner.
    "turn.started": async (_event, ctx) => {
      const { initiator } = ctx.session.auth;
      if (productionMode() && initiator) {
        await recordSessionOwner(ctx.session.id, initiator);
      }
    },
  },
});
