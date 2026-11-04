import { toNextJsHandler } from "better-auth/next-js";
import { auth, isVercelSignInConfigured } from "@/lib/auth";

const notFound = () => new Response(null, { status: 404 });

// Sign in with Vercel's routes exist only in production mode.
export const { GET, POST } = isVercelSignInConfigured
  ? toNextJsHandler(auth)
  : { GET: notFound, POST: notFound };
