/**
 * What the demo's crew says and does, as eve session events, so the dashboard's
 * real chat, approval cards and computer panel render it. All sample data, and
 * no model or network is involved.
 *
 * @packageDocumentation
 */

import type { SessionEvent } from "eve/client";

interface DemoTool {
  /** Asks first, like web_fetch: an approval card with this prompt. */
  readonly approval?: string;
  readonly input: Record<string, unknown>;
  readonly name: string;
  readonly output: Record<string, unknown>;
}

interface DemoScript {
  /** The reply when the person denies the approval. */
  readonly denied?: string;
  readonly reply: string;
  readonly thinking?: string;
  readonly tools?: readonly DemoTool[];
}

const SHELL_OK = { exitCode: 0, stderr: "", truncated: false };

const SCRIPTS: Readonly<Record<string, DemoScript>> = {
  "Compare three vendors for us": {
    reply: `Here's how the three compare, using example data for this demo:

| Vendor | Uptime | Price per seat | SSO |
| --- | --- | --- | --- |
| Vendor A | 99.9% | $12 | Paid add-on |
| Vendor B | 99.99% | $18 | Included |
| Vendor C | 99.5% | $9 | Not offered |

**I'd pick Vendor B.** It costs the most per seat, but it has the best uptime and includes SSO.`,
    thinking:
      "They want a decision, not just a list. Compare what matters most to a team: reliability, cost and sign-in.",
    tools: [
      {
        input: { query: "Vendor A vs Vendor B vs Vendor C uptime pricing SSO" },
        name: "web_search",
        output: {
          results: [
            { title: "Example: vendor comparison", url: "https://example.com" },
          ],
        },
      },
    ],
  },
  "Draft the release notes": {
    reply: `I've drafted the notes in \`release-notes.md\`; open **Computer** to read the file.

## Example release, version 2.4

- **Faster search** across every project
- **Single sign-on** for all teams
- **Fixed** a bug that hid archived items`,
    tools: [
      {
        input: { command: "git log --oneline v2.3..HEAD" },
        name: "bash",
        output: {
          ...SHELL_OK,
          stdout:
            "a1f3c9e Speed up project search\n7be2d41 Add single sign-on\n3c9a0f7 Show archived items again\n",
        },
      },
      {
        input: {
          content:
            "# Version 2.4\n\n- Faster search across every project\n- Single sign-on for all teams\n- Fixed a bug that hid archived items\n",
          filePath: "/workspace/release-notes.md",
        },
        name: "write_file",
        output: { path: "/workspace/release-notes.md" },
      },
    ],
  },
  "Find the latest news about eve": {
    reply: `This is a scripted demo, so these are **example results**, not a live search. A deployed crew member searches the web through AI Gateway and answers from what it finds, with sources.

Browse [eve.dev](https://eve.dev) for what's actually new.`,
    tools: [
      {
        input: { query: "latest news about eve" },
        name: "web_search",
        output: {
          results: [{ title: "eve", url: "https://eve.dev" }],
        },
      },
    ],
  },
  "Summarize a web page for me": {
    denied:
      "No problem, I won't fetch it. Every fetch asks first, because a URL could carry chat data out of the sandbox.",
    reply:
      "That page describes **eve**, a framework for building AI agents. This summary is scripted, but the approval you just gave is how it works in a real deployment: fetching a page runs outside the sandbox, so the crew asks first.",
    tools: [
      {
        approval: "Fetch https://eve.dev?",
        input: { url: "https://eve.dev" },
        name: "web_fetch",
        output: { status: 200, title: "eve", url: "https://eve.dev" },
      },
    ],
  },
  "Total this month's invoices": {
    reply: `This month's example invoices total **$4,820.00** across 3 vendors. Open **Computer** to see the command I ran.

| Vendor | Amount |
| --- | ---: |
| Acme Hosting | $2,400.00 |
| Example Design | $1,620.00 |
| Sample Software | $800.00 |`,
    tools: [
      {
        input: {
          command: "awk -F, 'NR>1 {sum+=$2} END {print sum}' invoices.csv",
        },
        name: "bash",
        output: { ...SHELL_OK, stdout: "4820\n" },
      },
    ],
  },
  "Turn my notes into a plan": {
    reply: `Here's an example plan, in three stages:

\`\`\`mermaid
graph LR
  A[Research] --> B[Build]
  B --> C[Launch]
\`\`\`

1. **Research:** talk to five customers and write up what you hear.
2. **Build:** ship the smallest version that solves the top problem.
3. **Launch:** release to a small group first, then everyone.`,
    thinking:
      "The notes are scattered. Group them into stages with a clear order.",
  },
  "What can you help me with?": {
    reply: `I'm Lopsi, one of the crew in this demo. A deployed crew can:

- **Research** on the web and summarize what it finds
- **Run commands and work with files** in its own sandbox
- **Use your tools** like Linear, Notion and Sentry through connectors, asking before it changes anything
- **Be reached** by email and messaging as well as this chat

Try another suggestion, or chat with someone else from the crew.`,
  },
  "Why did last night's deploy fail?": {
    reply: `The example deploy failed on a **missing environment variable**:

\`\`\`text
Error: DATABASE_URL is not set
\`\`\`

Add \`DATABASE_URL\` to the project's environment variables, then redeploy. Open **Computer** to see the log I checked.`,
    tools: [
      {
        input: { command: "grep -n ERROR logs/deploy.log" },
        name: "bash",
        output: {
          ...SHELL_OK,
          stdout: "212:ERROR Error: DATABASE_URL is not set\n",
        },
      },
    ],
  },
};

const FALLBACK: DemoScript = {
  reply: `This is a scripted demo, so I can only answer the suggested prompts; nothing you type reaches a model. Try a suggestion, or chat with someone else from the crew.

To talk to a real crew, [deploy your own](https://github.com/frankievalentine/lopsi-bot-eve#deploy).`,
};

/** A moment in a scripted turn. */
export type DemoBeat =
  | { readonly facts: readonly SessionEvent[]; readonly wait: number }
  | { readonly progress: SessionEvent; readonly wait: number }
  /** Stops until the person answers; `approved` or `denied` then continues. */
  | {
      readonly approved: readonly DemoBeat[];
      readonly denied: readonly DemoBeat[];
      readonly interactionId: string;
    };

const fact = (
  type: string,
  data: Record<string, unknown>,
  scope?: Record<string, string>
) => ({ data, type, ...(scope ? { scope } : {}) }) as SessionEvent;

const WORDS = /\S+\s*/gu;

function textBeats(
  partId: string,
  kind: "reasoning" | "text",
  text: string,
  scope: Record<string, string>,
  runId: string
): DemoBeat[] {
  const deltas: DemoBeat[] = (text.match(WORDS) ?? []).map((delta) => ({
    progress: fact("content.delta", { delta, kind, partId }, scope),
    wait: 18,
  }));
  return [
    ...deltas,
    {
      facts: [
        fact(
          "content.completed",
          {
            kind,
            partId,
            phase: kind === "text" ? "reply" : "narration",
            runId,
            value: text,
          },
          scope
        ),
      ],
      wait: 0,
    },
  ];
}

/** A turn's events, from the message arriving to its reply settling. */
export function scriptedTurn(options: {
  /** The turn before this one, if any. */
  readonly follows: string | null;
  /** Unique within the session. */
  readonly id: string;
  readonly isFirst: boolean;
  readonly text: string;
}): readonly DemoBeat[] {
  const { follows, id, isFirst, text } = options;
  const script = SCRIPTS[text.trim()] ?? FALLBACK;
  const deliveryId = `delivery_${id}`;
  const turnId = `turn_${id}`;
  const scope = { turnId };

  let runs = 0;
  /** A model run producing `then`, opened and settled around it. */
  const modelRun = (
    then: (runId: string) => readonly DemoBeat[],
    finishReason: string
  ): DemoBeat[] => {
    runs += 1;
    const runId = `run_${id}_${runs}`;
    const runScope = { runId, turnId };
    return [
      {
        facts: [
          fact("model.requested", { owner: { turnId }, runId }, scope),
          fact(
            "model.started",
            { attempt: 1, modelId: "demo/scripted", runId },
            runScope
          ),
        ],
        wait: 350,
      },
      ...then(runId),
      {
        facts: [
          fact(
            "model.settled",
            { finishReason, outcome: "completed", runId },
            runScope
          ),
        ],
        wait: 60,
      },
    ];
  };

  /** The reply, then the turn settling. A delivery settles once: at a pause, if there was one. */
  const ending = (reply: string, paused = false): DemoBeat[] => {
    const partId = `text_${id}_${runs + 1}`;
    return [
      ...modelRun(
        (runId) => textBeats(partId, "text", reply, { runId, turnId }, runId),
        "stop"
      ),
      {
        facts: [
          fact(
            "turn.settled",
            { outcome: "completed", reply: [partId], turnId },
            scope
          ),
          ...(paused
            ? []
            : [
                fact(
                  "delivery.settled",
                  { deliveryId, outcome: "handled", turnId },
                  scope
                ),
              ]),
        ],
        wait: 0,
      },
    ];
  };

  /** Runs the tools from `index` on, then the reply. */
  const toolBeats = (index: number, paused = false): readonly DemoBeat[] => {
    const tool = script.tools?.[index];
    if (tool === undefined) {
      return ending(script.reply, paused);
    }
    const callId = `call_${id}_${index}`;
    const requested = modelRun(
      (runId) => [
        {
          facts: [
            fact(
              "call.requested",
              {
                callId,
                capability: { kind: "tool", name: tool.name },
                input: tool.input,
                owner: { runId },
              },
              { runId, turnId }
            ),
          ],
          wait: 80,
        },
      ],
      "tool-calls"
    );
    const run = (clearedBy?: object): DemoBeat[] => [
      {
        facts: [
          fact(
            "call.started",
            {
              callId,
              ...(clearedBy
                ? { clearedBy }
                : { clearedBy: { policy: "allow" } }),
            },
            scope
          ),
        ],
        wait: 700,
      },
      {
        facts: [
          fact(
            "call.settled",
            { callId, outcome: "completed", output: tool.output },
            scope
          ),
        ],
        wait: 150,
      },
    ];
    if (tool.approval === undefined) {
      return [...requested, ...run(), ...toolBeats(index + 1, paused)];
    }
    const interactionId = `interaction_${id}_${index}`;
    const settled = (outcome: "accepted" | "declined"): DemoBeat => ({
      facts: [fact("interaction.settled", { interactionId, outcome }, scope)],
      wait: 100,
    });
    return [
      ...requested,
      {
        facts: [
          fact(
            "interaction.opened",
            {
              interactionId,
              request: {
                display: "confirmation",
                kind: "approval",
                options: [
                  { id: "approve", label: "Approve", style: "primary" },
                  { id: "deny", label: "Deny", style: "danger" },
                ],
                prompt: tool.approval,
              },
              subject: { callId },
            },
            scope
          ),
          fact("turn.paused", { awaiting: [{ interactionId }], turnId }, scope),
          fact(
            "delivery.settled",
            { deliveryId, outcome: "awaiting-input", turnId },
            scope
          ),
        ],
        wait: 200,
      },
      {
        approved: [
          settled("accepted"),
          ...run({ interactionId }),
          ...toolBeats(index + 1, true),
        ],
        denied: [
          settled("declined"),
          {
            facts: [
              fact(
                "call.settled",
                { callId, outcome: "rejected", reason: "Denied." },
                scope
              ),
            ],
            wait: 100,
          },
          ...ending(script.denied ?? script.reply, true),
        ],
        interactionId,
      },
    ];
  };

  const thinking =
    script.thinking === undefined
      ? []
      : modelRun(
          (runId) =>
            textBeats(
              `reasoning_${id}`,
              "reasoning",
              script.thinking ?? "",
              { runId, turnId },
              runId
            ),
          "stop"
        );

  return [
    {
      facts: [
        ...(isFirst ? [fact("session.started", {})] : []),
        fact("delivery.admitted", {
          deliveryId,
          source: { channel: "eve" },
        }),
      ],
      wait: 120,
    },
    {
      facts: [
        fact("turn.started", { cause: { deliveryId }, follows, turnId }, scope),
        fact("delivery.consumed", {
          deliveryId,
          parts: [{ kind: "text", text }],
          turnId,
        }),
      ],
      wait: 120,
    },
    ...thinking,
    ...toolBeats(0),
  ];
}
