import { type CrewMember, CREW as DEPLOYED } from "./crew.generated";
import { isDemo } from "./demo";

export type { CrewMember } from "./crew.generated";

/** The example crew in demo mode, one per mascot, with prompts it has scripts for. */
const DEMO_CREW: readonly CrewMember[] = [
  {
    id: "lopsi",
    mascot: "skipper",
    name: "Lopsi",
    role: "General helper",
    suggestions: [
      "What can you help me with?",
      "Find the latest news about eve",
      "Summarize a web page for me",
    ],
  },
  {
    id: "scout",
    mascot: "lookout",
    name: "Scout",
    role: "Researcher",
    suggestions: ["Compare three vendors for us"],
  },
  {
    id: "purser",
    mascot: "purser",
    name: "Purser",
    role: "Finance and invoices",
    suggestions: ["Total this month's invoices"],
  },
  {
    id: "navigator",
    mascot: "navigator",
    name: "Navigator",
    role: "Planning and roadmaps",
    suggestions: ["Turn my notes into a plan"],
  },
  {
    id: "deckhand",
    mascot: "deckhand",
    name: "Deckhand",
    role: "Ops and on-call",
    suggestions: ["Why did last night's deploy fail?"],
  },
  {
    id: "signal",
    mascot: "signal",
    name: "Signal",
    role: "Comms and releases",
    suggestions: ["Draft the release notes"],
  },
];

/** The crew this deployment shows. */
export const CREW: readonly CrewMember[] = isDemo ? DEMO_CREW : DEPLOYED;
