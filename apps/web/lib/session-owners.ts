/**
 * Who started each eve session, so production mode can keep a chat to the
 * person who started it. eve admits any caller the channel accepts to any
 * session whose id they have; its docs leave binding sessions to their owner to
 * the app ("save which tenant and user each session belongs to, and check it").
 *
 * Owners live in a private Vercel Blob store (`BLOB_STORE_ID`, reached with
 * the project's OIDC token), one small JSON document per session.
 * `pnpm setup:sign-in` creates and connects the store.
 *
 * @packageDocumentation
 */

import { BlobNotFoundError, get, put } from "@vercel/blob";
import { ForbiddenError } from "eve/channels/auth";
import type { SessionAuthContext } from "eve/context";

/** The authenticator of people signed in with Vercel (production mode). */
export const SIGNED_IN_AUTHENTICATOR = "better-auth:vercel";

/** The parts of a principal that identify a person across requests. */
export interface SessionOwner {
  readonly authenticator: string;
  readonly principalId: string;
}

const PREFIX = "lopsi/session-owners";
// eve session ids are workflow run ids (`wrun_` and a ULID). Anything else is
// refused before it reaches a Blob pathname.
const SESSION_ID = /^wrun_[0-9A-Za-z]{10,64}$/u;
// The agent sees /eve/v1/…; a workspace prefix (/eve/<agent>/v1/…) is tolerated in case a
// route reaches it unrewritten.
const SESSION_ROUTE =
  /^\/eve\/(?:[^/]+\/)?v1\/session\/(?<sessionId>[^/]+)(?:\/|$)/u;

// Owners never change, so a known one is cached for the life of the instance.
const owners = new Map<string, SessionOwner>();

/** Whether the owner store is connected (production mode needs it). */
export function isSessionOwnerStoreConfigured(): boolean {
  return Boolean(
    process.env.BLOB_STORE_ID || process.env.BLOB_READ_WRITE_TOKEN
  );
}

function pathnameOf(sessionId: string): string | undefined {
  return SESSION_ID.test(sessionId) ? `${PREFIX}/${sessionId}.json` : undefined;
}

/**
 * The session a request is about, from its path (`/eve/v1/session/<id>/…`), or
 * `undefined` for routes that aren't about one session, such as creating one.
 */
function sessionIdOf(request: Request): string | undefined {
  const sessionId = SESSION_ROUTE.exec(new URL(request.url).pathname)?.groups
    ?.sessionId;
  return sessionId === undefined ? undefined : decodeURIComponent(sessionId);
}

/**
 * Records who started a session: eve's initiator, which never changes, so
 * repeated or concurrent writes for one session store the same owner.
 */
export async function recordSessionOwner(
  sessionId: string,
  initiator: SessionAuthContext
): Promise<void> {
  const pathname = pathnameOf(sessionId);
  if (pathname === undefined || owners.has(sessionId)) {
    return;
  }
  const owner: SessionOwner = {
    authenticator: initiator.authenticator,
    principalId: initiator.principalId,
  };
  await put(pathname, JSON.stringify(owner), {
    access: "private",
    addRandomSuffix: false,
    allowOverwrite: true,
    contentType: "application/json",
  });
  owners.set(sessionId, owner);
}

/** Who started a session, or `undefined` when no owner has been recorded yet. */
async function sessionOwner(
  sessionId: string
): Promise<SessionOwner | undefined> {
  const cached = owners.get(sessionId);
  if (cached) {
    return cached;
  }
  const pathname = pathnameOf(sessionId);
  if (pathname === undefined) {
    return undefined;
  }
  let result: Awaited<ReturnType<typeof get>>;
  try {
    result = await get(pathname, { access: "private", useCache: false });
  } catch (error) {
    if (error instanceof BlobNotFoundError) {
      return undefined;
    }
    throw error;
  }
  if (result === null) {
    return undefined;
  }
  const owner = JSON.parse(
    await new Response(result.stream).text()
  ) as SessionOwner;
  owners.set(sessionId, owner);
  return owner;
}

/**
 * Whether `person` started the session. A session with no owner recorded yet
 * isn't anyone's, so it's `false`.
 */
export async function isSessionOwnedBy(
  sessionId: string,
  person: SessionOwner
): Promise<boolean> {
  if (!SESSION_ID.test(sessionId)) {
    return false;
  }
  const owner = await sessionOwner(sessionId);
  return (
    owner !== undefined &&
    owner.principalId === person.principalId &&
    owner.authenticator === person.authenticator
  );
}

/**
 * Refuses a request about someone else's session. Requests that aren't about
 * one session (creating one) pass, and so does a session with no owner yet:
 * eve records the owner when its first turn starts, before that it holds no
 * conversation.
 *
 * @throws {@link ForbiddenError} For a malformed session id, or a session that
 * another person started.
 */
export async function requireSessionOwner(
  request: Request,
  caller: SessionAuthContext
): Promise<void> {
  const sessionId = sessionIdOf(request);
  if (sessionId === undefined) {
    return;
  }
  if (!SESSION_ID.test(sessionId)) {
    throw new ForbiddenError({ message: "Unknown chat." });
  }
  const owner = await sessionOwner(sessionId);
  if (
    owner !== undefined &&
    (owner.principalId !== caller.principalId ||
      owner.authenticator !== caller.authenticator)
  ) {
    throw new ForbiddenError({ message: "This chat belongs to someone else." });
  }
}
