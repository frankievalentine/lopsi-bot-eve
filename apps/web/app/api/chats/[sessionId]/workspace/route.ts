import { currentChatOwner } from "@/lib/chat-owner";
import { isSessionOwnedBy } from "@/lib/session-owners";
import { loadWorkspace } from "@/lib/workspace-store";

/** A chat's latest workspace snapshot, for its owner. */
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ sessionId: string }> }
) {
  const owner = await currentChatOwner();
  if (owner === undefined) {
    return new Response("Workspace snapshots aren't kept here.", {
      status: 404,
    });
  }
  const { sessionId } = await params;
  if (!(await isSessionOwnedBy(sessionId, owner))) {
    return new Response("Not your chat.", { status: 403 });
  }
  const snapshot = await loadWorkspace(sessionId);
  return snapshot === undefined
    ? new Response(null, { status: 204 })
    : Response.json(snapshot, { headers: { "cache-control": "no-store" } });
}
