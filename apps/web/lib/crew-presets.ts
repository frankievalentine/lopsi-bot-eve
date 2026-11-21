/**
 * The New crew member wizard's starting points: a crew role fills in the name,
 * look, model, starter prompts and an instructions draft, all of which can be
 * changed before the pull request opens. Start blank fills in nothing.
 *
 * Model ids are AI Gateway ids; the wizard only suggests one that's on the
 * gateway's current list.
 *
 * @packageDocumentation
 */

import type { MascotKind } from "@/components/mascot";
import type { ReasoningLevel } from "./agent-model";

export interface CrewPreset {
  /** One sentence on what this member does, under the role cards. */
  readonly does: string;
  readonly id: string;
  /** The first draft of instructions.md. */
  readonly instructions: string;
  readonly mascot: MascotKind;
  readonly model: string;
  readonly name: string;
  readonly reasoning: ReasoningLevel | "";
  readonly role: string;
  /** A hint on the Access step about which services this kind of member needs. */
  readonly servicesTip: string;
  readonly suggestions: readonly string[];
}

/** Why a model is suggested, for the Model step's cards. */
export const MODEL_NOTES: Readonly<Record<string, string>> = {
  "anthropic/claude-opus-5.5":
    "Most capable, for long careful work. Costs more per chat.",
  "anthropic/claude-sonnet-5.5":
    "Careful with numbers and documents at a moderate cost per chat.",
  "deepseek/deepseek-v4.1-flash-1017":
    "Fast and inexpensive, for many short replies.",
  "google/gemini-3.8-flash":
    "Fast with a long context, good for reading a lot of sources.",
  "meituan/longcat-2.5": "A capable general-purpose default.",
  "openai/gpt-6-luna": "Quick and inexpensive, for frequent checks.",
  "openai/gpt-6.1-terra": "Strong at planning and writing.",
};

function draft(
  name: string,
  role: string,
  purpose: string,
  work: readonly string[]
): string {
  return `# Identity

You are ${name}, the crew's ${role.toLowerCase()}. You ${purpose}.

# How you work

${work.map((line) => `- ${line}`).join("\n")}
- Ask before doing anything that can't be undone.
`;
}

export const CREW_PRESETS: readonly CrewPreset[] = [
  {
    does: "Scout finds, reads and summarizes, with sources.",
    id: "scout",
    instructions: draft(
      "Scout",
      "Research",
      "find, read and summarize so the team can decide quickly",
      [
        "Link to every source you use.",
        "Lead with the answer, then the detail.",
      ]
    ),
    mascot: "navigator",
    model: "google/gemini-3.8-flash",
    name: "Scout",
    reasoning: "",
    role: "Research",
    servicesTip:
      "Research usually needs read access to docs and trackers, not chat services.",
    suggestions: [
      "Summarize what changed in our docs this week",
      "Compare recent writing on a topic",
      "Turn this link into a one-page brief",
      "What should I read before tomorrow?",
    ],
  },
  {
    does: "Chief keeps plans, follow-ups and summaries moving.",
    id: "chief",
    instructions: draft(
      "Chief",
      "Chief of staff",
      "keep the team on track: plans, follow-ups and summaries",
      [
        "Start with what needs a decision today.",
        "Name an owner and a date for every follow-up.",
      ]
    ),
    mascot: "skipper",
    model: "openai/gpt-6.1-terra",
    name: "Chief",
    reasoning: "",
    role: "Chief of staff",
    servicesTip:
      "A chief of staff often needs your tracker and chat to post updates.",
    suggestions: [
      "What needs my attention today?",
      "Draft the weekly update",
      "Follow up on open threads",
      "Plan next week",
    ],
  },
  {
    does: "Beacon watches services and errors and flags what needs you.",
    id: "beacon",
    instructions: draft(
      "Beacon",
      "Service monitor",
      "watch our services and flag what needs a person",
      [
        "Say what's affected and since when before anything else.",
        "Don't guess at causes; say what you checked.",
      ]
    ),
    mascot: "lookout",
    model: "openai/gpt-6-luna",
    name: "Beacon",
    reasoning: "",
    role: "Service monitor",
    servicesTip:
      "A monitor needs your error tracker; keep it out of places it could post.",
    suggestions: [
      "Is everything healthy?",
      "What broke overnight?",
      "Watch the next deploy",
      "Summarize today's errors",
    ],
  },
  {
    does: "Ledger reconciles invoices and keeps an eye on spend.",
    id: "ledger",
    instructions: draft(
      "Ledger",
      "Finance",
      "keep our books tidy: invoices, spend and summaries",
      [
        "Show your arithmetic and where each number came from.",
        "Flag anything unusual instead of correcting it yourself.",
      ]
    ),
    mascot: "purser",
    model: "anthropic/claude-sonnet-5.5",
    name: "Ledger",
    reasoning: "medium",
    role: "Finance",
    servicesTip:
      "Finance work is best limited to billing and accounting services.",
    suggestions: [
      "Reconcile this month's invoices",
      "What did we spend on tools?",
      "Flag anything unusual",
      "Draft the spend summary",
    ],
  },
  {
    does: "Tinker fixes builds, ships deploys and restarts what's stuck.",
    id: "tinker",
    instructions: draft(
      "Tinker",
      "Ops and CI",
      "keep builds green and deploys moving",
      [
        "Read the logs before proposing a fix.",
        "Say what you'll change and how to undo it.",
      ]
    ),
    mascot: "deckhand",
    model: "anthropic/claude-opus-5.5",
    name: "Tinker",
    reasoning: "high",
    role: "Ops and CI",
    servicesTip:
      "Ops often needs GitHub and your deploy tools; keep changes asking first.",
    suggestions: [
      "Why did the last build fail?",
      "Ship the release",
      "Restart what's stuck",
      "Clean up old branches",
    ],
  },
  {
    does: "Relay answers email and chat and drafts replies for you.",
    id: "relay",
    instructions: draft(
      "Relay",
      "Inbox and messages",
      "answer messages and draft replies so nobody waits",
      [
        "Draft replies; send only when asked.",
        "Keep replies short and in the sender's language.",
      ]
    ),
    mascot: "signal",
    model: "deepseek/deepseek-v4.1-flash-1017",
    name: "Relay",
    reasoning: "",
    role: "Inbox and messages",
    servicesTip:
      "Messages need email or chat services; posting asks you first by default.",
    suggestions: [
      "Get my inbox to zero",
      "Draft replies to today's email",
      "Who's waiting on me?",
      "Summarize this thread",
    ],
  },
];

/** Start blank: no name, role or suggestions, and a bare instructions outline. */
export const BLANK_PRESET: CrewPreset = {
  does: "No suggestions. Fill in every step yourself.",
  id: "",
  instructions: `# Identity

You are a member of the crew. Describe what you're for here.

# How you work

- Ask before doing anything that can't be undone.
`,
  mascot: "lookout",
  model: "meituan/longcat-2.5",
  name: "",
  reasoning: "",
  role: "",
  servicesTip: "Pick the services this member needs.",
  suggestions: [],
};

/** Sections the Instructions step can append to the draft. */
export const INSTRUCTION_SECTIONS: readonly {
  readonly label: string;
  readonly text: string;
}[] = [
  {
    label: "Answer format",
    text: `# Answer format

- Lead with the answer in one or two sentences.
- Use short lists for steps; link sources inline.
`,
  },
  {
    label: "When to ask first",
    text: `# Check with me first

- Before posting, sending or editing anything others will see.
- Before spending money or deleting anything.
`,
  },
  {
    label: "Tone",
    text: `# Tone

- Plain and friendly. No filler, no exclamation marks.
`,
  },
];
