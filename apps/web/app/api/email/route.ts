import { createConnectWebhookVerifier } from "@vercel/connect/chat";
import { getVercelOidcToken } from "@vercel/oidc";
import { CREW } from "@/lib/crew";
import { addressedMembers, emailDomain } from "@/lib/email";

const verify = createConnectWebhookVerifier();

/**
 * Received email from the Resend connector (Settings turns this on; see
 * lib/email.ts). Connect checks Resend's signature and forwards each event
 * with a Vercel OIDC token, checked here. Each email goes on to the crew
 * members it's addressed to (`/eve/<member>/v1/resend`), with this
 * deployment's own OIDC token, which their channels accept. One route for the
 * whole crew, because Connect sends a connector's events to at most three
 * places.
 */
export async function POST(request: Request) {
  const body = await request.text();
  try {
    if (!(await verify(request, body))) {
      return new Response("Not from Vercel Connect.", { status: 401 });
    }
  } catch {
    return new Response("Not from Vercel Connect.", { status: 401 });
  }
  let payload: unknown;
  try {
    payload = JSON.parse(body);
  } catch {
    return new Response("Not JSON.", { status: 400 });
  }
  const domain = emailDomain();
  const members =
    domain === undefined
      ? []
      : addressedMembers(
          payload,
          domain,
          CREW.map((member) => member.id)
        );
  if (members.length === 0) {
    // Nothing here answers it; a retry wouldn't change that.
    return new Response(null, { status: 204 });
  }
  const token = await getVercelOidcToken();
  const { origin } = new URL(request.url);
  const results = await Promise.all(
    members.map((memberId) =>
      fetch(`${origin}/eve/${encodeURIComponent(memberId)}/v1/resend`, {
        body,
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        method: "POST",
      }).then(
        (response) => response.ok,
        () => false
      )
    )
  );
  // A failure asks Connect to retry; members that already have it drop the repeat.
  return results.every(Boolean)
    ? new Response(null, { status: 204 })
    : new Response("A crew member didn't take it.", { status: 502 });
}
