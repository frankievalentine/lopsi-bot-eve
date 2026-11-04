import { CrewPage } from "@/app/_components/crew-page";

export default async function ChatPage({
  params,
}: {
  readonly params: Promise<{
    readonly agent: string;
    readonly sessionId: string;
  }>;
}) {
  const { agent, sessionId } = await params;
  return (
    <CrewPage
      memberId={agent}
      path={`/c/${encodeURIComponent(agent)}/s/${encodeURIComponent(sessionId)}`}
      sessionId={sessionId}
    />
  );
}
