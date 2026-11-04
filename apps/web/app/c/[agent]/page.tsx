import { CrewPage } from "@/app/_components/crew-page";

export default async function NewChatPage({
  params,
}: {
  readonly params: Promise<{ readonly agent: string }>;
}) {
  const { agent } = await params;
  return <CrewPage memberId={agent} path={`/c/${encodeURIComponent(agent)}`} />;
}
