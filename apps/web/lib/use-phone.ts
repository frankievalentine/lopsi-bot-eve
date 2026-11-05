"use client";

import { useSyncExternalStore } from "react";

// Below this, the crew list (320px) and the chat (560px) don't fit side by side.
const PHONE = "(max-width: 879px)";

function subscribe(onChange: () => void): () => void {
  const query = window.matchMedia?.(PHONE);
  query?.addEventListener("change", onChange);
  return () => query?.removeEventListener("change", onChange);
}

/**
 * True on screens too narrow for two columns, where the dashboard shows one
 * screen at a time: phones in either orientation, and small tablets.
 * The server renders the wide layout; phones switch after hydration.
 */
export function useIsPhone(): boolean {
  return useSyncExternalStore(
    subscribe,
    () => window.matchMedia?.(PHONE).matches ?? false,
    () => false
  );
}
