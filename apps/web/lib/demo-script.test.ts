import {
  conversationOf,
  type SessionEvent,
  type SessionStreamEvent,
} from "eve/client";
import { createStreamChecker } from "eve/events";
import { describe, expect, it } from "vitest";
import { type DemoBeat, scriptedTurn } from "./demo-script";

const PROMPTS = [
  "What can you help me with?",
  "Find the latest news about eve",
  "Summarize a web page for me",
  "Compare three vendors for us",
  "Total this month's invoices",
  "Turn my notes into a plan",
  "Why did last night's deploy fail?",
  "Draft the release notes",
  "anything else someone types",
];

type Branch = "approved" | "denied";

function flat(beats: readonly DemoBeat[], branch: Branch): DemoBeat[] {
  const walk = (list: readonly DemoBeat[]): DemoBeat[] =>
    list.flatMap((beat) =>
      "interactionId" in beat ? walk(beat[branch]) : [beat]
    );
  return walk(beats);
}

const stamped = (facts: readonly SessionEvent[], at: string, line: number) =>
  facts.map(
    (fact, index) =>
      ({
        ...fact,
        meta: { at, position: { index, line } },
      }) as SessionStreamEvent
  );

/** Two turns as a stream: eve's violations of it, and what they fold into. */
function play(text: string, branch: Branch) {
  const checker = createStreamChecker();
  const events: SessionStreamEvent[] = [];
  const violations: string[] = [];
  let line = 0;
  let follows: string | null = null;
  for (const id of ["1", "2"]) {
    for (const beat of flat(
      scriptedTurn({ follows, id, isFirst: id === "1", text }),
      branch
    )) {
      const at = new Date(0).toISOString();
      const stored =
        "facts" in beat
          ? { at, facts: beat.facts }
          : { progress: beat.progress };
      violations.push(
        ...checker.check(stored as never, line).map((found) => found.message)
      );
      if ("facts" in beat) {
        events.push(...stamped(beat.facts, at, line));
      }
      line += 1;
    }
    follows = `turn_${id}`;
  }
  return { state: conversationOf(events), violations };
}

describe("scriptedTurn", () => {
  describe.each(["approved", "denied"] as const)("when %s", (branch) => {
    it.each(PROMPTS)("%s follows eve's stream contract", (prompt) => {
      expect(play(prompt, branch).violations).toEqual([]);
    });
  });

  it.each(PROMPTS)("%s ends in a reply", (prompt) => {
    const { state } = play(prompt, "approved");
    const replies = state.messages.filter(
      (message) => message.role === "assistant"
    );
    expect(replies).toHaveLength(2);
    for (const reply of replies) {
      expect(reply.parts.some((part) => part.type === "text")).toBe(true);
    }
  });

  it("sends the person's message in the shape eve reads", () => {
    const facts = flat(
      scriptedTurn({ follows: null, id: "1", isFirst: true, text: "Hello" }),
      "approved"
    ).flatMap((beat) => ("facts" in beat ? beat.facts : []));
    const consumed = facts.find((fact) => fact.type === "delivery.consumed");
    expect(consumed?.data).toMatchObject({
      parts: [{ kind: "text", text: "Hello" }],
    });
  });

  it("asks before fetching a page", () => {
    const beats = scriptedTurn({
      follows: null,
      id: "1",
      isFirst: true,
      text: "Summarize a web page for me",
    });
    expect(beats.some((beat) => "interactionId" in beat)).toBe(true);
  });
});
