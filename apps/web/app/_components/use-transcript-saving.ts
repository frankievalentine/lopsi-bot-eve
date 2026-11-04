"use client";

import type { ClientSessionState, SessionStreamEvent } from "eve/client";
import { useEffect, useRef } from "react";

/** How often a streaming reply is saved. A stopped turn is saved at once. */
const SAVE_EVERY_MS = 3000;

interface Latest {
  readonly events: readonly SessionStreamEvent[];
  readonly session: ClientSessionState | undefined;
}

/**
 * Saves the chat's transcript (eve's events and session cursor, unchanged) to
 * the server as it grows, so it reopens on any device and stays readable after
 * eve deletes the session's run data. Saves run one at a time and only ever
 * grow the saved copy, so an older save can't overwrite a newer one.
 */
export function useTranscriptSaving({
  busy,
  enabled,
  events,
  loaded,
  session,
}: {
  readonly busy: boolean;
  readonly enabled: boolean;
  readonly events: readonly SessionStreamEvent[];
  /** How many events the chat opened with: already saved. */
  readonly loaded: number;
  readonly session: ClientSessionState | undefined;
}): void {
  const latest = useRef<Latest>({ events, session });
  latest.current = { events, session };
  const saved = useRef(loaded);
  const queue = useRef<Promise<void>>(Promise.resolve());
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  useEffect(() => {
    const save = () => {
      queue.current = queue.current.then(async () => {
        const { current } = latest;
        if (
          current.session === undefined ||
          current.events.length <= saved.current
        ) {
          return;
        }
        const count = current.events.length;
        try {
          const response = await fetch(
            `/api/chats/${encodeURIComponent(current.session.sessionId)}/transcript`,
            {
              body: JSON.stringify({
                events: current.events,
                session: current.session,
              }),
              headers: { "content-type": "application/json" },
              method: "POST",
            }
          );
          if (response.ok) {
            saved.current = count;
          }
        } catch {
          // Offline or the store is down: the next change tries again.
        }
      });
    };
    if (!enabled || session === undefined || events.length <= saved.current) {
      return;
    }
    if (!busy) {
      clearTimeout(timer.current);
      timer.current = undefined;
      save();
      return;
    }
    timer.current ??= setTimeout(() => {
      timer.current = undefined;
      save();
    }, SAVE_EVERY_MS);
  }, [busy, enabled, events.length, session]);

  useEffect(() => () => clearTimeout(timer.current), []);
}
