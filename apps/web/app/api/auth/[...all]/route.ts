import { toNextJsHandler } from "better-auth/next-js";
import { auth, isTrustedHost, isVercelSignInConfigured } from "@/lib/auth";

const notFound = () => new Response(null, { status: 404 });

/** Refuses an address sign-in doesn't trust yet, which Better Auth would throw on. */
const trusted =
  (handler: (request: Request) => Promise<Response>) => (request: Request) =>
    isTrustedHost(request.headers.get("host"))
      ? handler(request)
      : new Response(null, { status: 421 });

const handlers = toNextJsHandler(auth);

// Sign in with Vercel's routes exist only in production mode.
export const { GET, POST } = isVercelSignInConfigured
  ? { GET: trusted(handlers.GET), POST: trusted(handlers.POST) }
  : { GET: notFound, POST: notFound };
