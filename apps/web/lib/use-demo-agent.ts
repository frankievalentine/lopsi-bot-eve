"use client";

import {
  conversationOf,
  type SessionEvent,
  type SessionStreamEvent,
} from "eve/client";
import type {
  EveMessage,
  UseEveAgentOptions,
  UseEveAgentReturn,
} from "eve/react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { DemoBeat } from "./demo-script";

const storageKey = (sessionId: string) => `lopsi:demo:${sessionId}`;

function loadEvents(sessionId: string | undefined): SessionStreamEvent[] {
  if (sessionId === undefined) {
    return [];
  }
  try {
    const saved = window.localStorage.getItem(storageKey(sessionId));
    return saved ? (JSON.parse(saved) as SessionStreamEvent[]) : [];
  } catch {
    return [];
  }
}

/** What settles a stopped turn: whatever it still has open. */
function cancellationOf(
  events: readonly SessionEvent[],
  turnId: string | null
): readonly SessionEvent[] {
  if (
    turnId === null ||
    events.some(
      (event) => event.type === "turn.settled" && event.data.turnId === turnId
    )
  ) {
    return [];
  }
  const scope = { turnId };
  const fact = (type: string, data: object) =>
    ({ data, scope, type }) as SessionEvent;
  const open = (requested: string, settled: string, key: string) => {
    const ids = (type: string) =>
      events.flatMap((event) =>
        event.type === type ? [(event.data as Record<string, string>)[key]] : []
      );
    const done = new Set(ids(settled));
    return ids(requested).filter((id) => !done.has(id));
  };
  return [
    ...open("interaction.opened", "interaction.settled", "interactionId").map(
      (interactionId) =>
        fact("interaction.settled", { interactionId, outcome: "withdrawn" })
    ),
    ...open("call.requested", "call.settled", "callId").map((callId) =>
      fact("call.settled", { callId, outcome: "interrupted" })
    ),
    ...open("model.requested", "model.settled", "runId").map((runId) =>
      fact("model.settled", { outcome: "interrupted", runId })
    ),
    fact("turn.settled", { outcome: "cancelled", turnId }),
  ];
}

/**
 * `conversationOf` holds back people's messages, which a live session confirms
 * as it sends them, so they're added here, in the shape eve gives them.
 */
function withUserMessages(
  events: readonly SessionStreamEvent[],
  replies: readonly EveMessage[]
): readonly EveMessage[] {
  return events.flatMap((event): EveMessage[] => {
    if (event.type !== "delivery.consumed") {
      return [];
    }
    const { deliveryId, parts, turnId } = event.data;
    return [
      {
        id: `${deliveryId}:user`,
        metadata: { status: "complete", turnId },
        parts: parts.flatMap((part) =>
          part.kind === "text"
            ? [
                {
                  state: "done" as const,
                  text: part.text,
                  type: "text" as const,
                },
              ]
            : []
        ),
        role: "user",
      },
      ...replies.filter((reply) => reply.metadata?.turnId === turnId),
    ];
  });
}

const NOT_AVAILABLE = () => Promise.reject(new Error("Not in the demo."));

/**
 * `useEveAgent` for demo mode: plays a scripted turn as eve events in the
 * browser and folds them with eve's own projection, so the real chat renders it.
 * Nothing leaves the browser.
 */
export function useDemoAgent(options: UseEveAgentOptions): UseEveAgentReturn {
  const initialId = options.initialSession?.sessionId;
  const [events, setEvents] = useState<SessionStreamEvent[]>([]);
  const [sessionId, setSessionId] = useState(initialId);
  const [playing, setPlaying] = useState(false);
  const log = useRef<SessionStreamEvent[]>([]);
  const line = useRef(0);
  const turnCount = useRef(0);
  const lastTurn = useRef<string | null>(null);
  const queue = useRef<string[]>([]);
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined);
  const paused = useRef<Extract<DemoBeat, { interactionId: string }> | null>(
    null
  );
  const session = useRef(initialId);
  const onSessionChange = useRef(options.onSessionChange);
  onSessionChange.current = options.onSessionChange;

  // A browser-only read, so the server and first client render agree.
  useEffect(() => {
    const saved = loadEvents(initialId);
    log.current = saved;
    line.current = (saved.at(-1)?.meta.position.line ?? -1) + 1;
    turnCount.current = saved.filter(
      (event) => event.type === "turn.started"
    ).length;
    lastTurn.current =
      saved.findLast((event) => event.type === "turn.started")?.scope?.turnId ??
      null;
    setEvents(saved);
  }, [initialId]);

  useEffect(() => () => clearTimeout(timer.current), []);

  const emit = useCallback((next: readonly SessionEvent[]) => {
    const at = new Date().toISOString();
    // Every line takes a stream position, progress included.
    const position = line.current;
    line.current += 1;
    const stamped = next.map(
      (event, index) =>
        ({
          ...event,
          meta: {
            at,
            position: { index, line: position },
            ...(index === next.length - 1
              ? { endOfLine: true, next: position + 1 }
              : {}),
          },
        }) as SessionStreamEvent
    );
    log.current = [...log.current, ...stamped];
    setEvents(log.current);
  }, []);

  const save = useCallback(() => {
    if (session.current === undefined) {
      return;
    }
    try {
      window.localStorage.setItem(
        storageKey(session.current),
        // Progress is only for the live typing effect.
        JSON.stringify(
          log.current.filter((event) => event.type !== "content.delta")
        )
      );
    } catch {
      // Without storage, the chat just doesn't survive a reload.
    }
  }, []);

  const play = useCallback(
    (beats: readonly DemoBeat[]) => {
      const [beat, ...rest] = beats;
      if (beat === undefined) {
        save();
        const queued = queue.current.shift();
        if (queued === undefined) {
          setPlaying(false);
        } else {
          startTurn.current(queued);
        }
        return;
      }
      if ("interactionId" in beat) {
        paused.current = beat;
        save();
        setPlaying(false);
        return;
      }
      if ("facts" in beat) {
        emit(beat.facts);
      } else {
        emit([beat.progress]);
      }
      timer.current = setTimeout(() => play(rest), beat.wait);
    },
    [emit, save]
  );

  const startTurn = useRef<(text: string) => void>(() => undefined);
  startTurn.current = (text: string) => {
    turnCount.current += 1;
    const id = `${turnCount.current}`;
    const follows = lastTurn.current;
    lastTurn.current = `turn_${id}`;
    const isFirst = line.current === 0;
    setPlaying(true);
    // Loaded here so that a normal deployment never downloads the script.
    import("./demo-script")
      .then(({ scriptedTurn }) =>
        play(scriptedTurn({ follows, id, isFirst, text }))
      )
      .catch(() => setPlaying(false));
  };

  const send = ((message: unknown) => {
    const text = typeof message === "string" ? message : "";
    if (session.current === undefined) {
      const created = `demo_${crypto.randomUUID()}`;
      session.current = created;
      setSessionId(created);
      onSessionChange.current?.({ sessionId: created, streamIndex: 0 });
    }
    if (playing || paused.current !== null) {
      queue.current.push(text);
    } else {
      startTurn.current(text);
    }
    return Promise.resolve({});
  }) as UseEveAgentReturn["send"];

  const respond = ((answers: readonly { readonly optionId?: string }[]) => {
    const beat = paused.current;
    if (beat !== null) {
      paused.current = null;
      setPlaying(true);
      play(answers[0]?.optionId === "approve" ? beat.approved : beat.denied);
    }
    return Promise.resolve({});
  }) as unknown as UseEveAgentReturn["respond"];

  const cancel = (() => {
    clearTimeout(timer.current);
    paused.current = null;
    queue.current = [];
    const facts = cancellationOf(log.current, lastTurn.current);
    if (facts.length > 0) {
      emit(facts);
    }
    save();
    setPlaying(false);
    return Promise.resolve({});
  }) as UseEveAgentReturn["cancel"];

  const state = useMemo(() => {
    const conversation = conversationOf(events);
    return {
      ...conversation,
      messages: withUserMessages(events, conversation.messages),
    };
  }, [events]);

  return {
    ...state,
    cancel,
    clear: NOT_AVAILABLE,
    compact: NOT_AVAILABLE,
    end: NOT_AVAILABLE,
    error: undefined,
    events,
    follow: () => undefined,
    newSession: () => undefined,
    prewarm: () => Promise.resolve(),
    respond,
    resume: () => Promise.resolve(),
    send,
    session:
      sessionId === undefined ? undefined : { sessionId, streamIndex: 0 },
    status: playing ? "busy" : "idle",
  } as UseEveAgentReturn;
}
