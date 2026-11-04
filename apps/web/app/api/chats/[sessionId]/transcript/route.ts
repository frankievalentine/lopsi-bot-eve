import { currentChatOwner } from "@/lib/chat-owner";
import { MAX_TRANSCRIPT_BYTES, saveTranscript } from "@/lib/chat-store";
import { isSessionOwnedBy } from "@/lib/session-owners";

/** Saves a chat's transcript (eve's events and session cursor) for its owner. */
export async function POST(
  request: Request,
  { params }: { params: Promise<{ sessionId: string }> }
) {
  const origin = request.headers.get("origin");
  if (origin !== null && origin !== new URL(request.url).origin) {
    return new Response("Cross-site request.", { status: 403 });
  }
  const owner = await currentChatOwner();
  if (owner === undefined) {
    return new Response("Chat history isn't kept here.", { status: 404 });
  }
  const { sessionId } = await params;
  if (!(await isSessionOwnedBy(sessionId, owner))) {
    return new Response("Not your chat.", { status: 403 });
  }
  const body = await request.text();
  if (body.length > MAX_TRANSCRIPT_BYTES) {
    return new Response("Transcript too large.", { status: 413 });
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(body);
  } catch {
    return new Response("Not JSON.", { status: 400 });
  }
  if (
    typeof parsed !== "object" ||
    parsed === null ||
    !Array.isArray((parsed as { events?: unknown }).events) ||
    typeof (parsed as { session?: unknown }).session !== "object"
  ) {
    return new Response("Expected { events, session }.", { status: 400 });
  }
  const { events, session } = parsed as { events: unknown[]; session: unknown };
  await saveTranscript(sessionId, { events, session });
  return new Response(null, { status: 204 });
}
