"use client";

import { useSyncExternalStore } from "react";

const PHONE = "(max-width: 767px)";

function subscribe(onChange: () => void): () => void {
  const query = window.matchMedia?.(PHONE);
  query?.addEventListener("change", onChange);
  return () => query?.removeEventListener("change", onChange);
}

/**
 * True on phone-width screens, where the dashboard shows one screen at a time.
 * The server renders the wide layout; phones switch after hydration.
 */
export function useIsPhone(): boolean {
  return useSyncExternalStore(
    subscribe,
    () => window.matchMedia?.(PHONE).matches ?? false,
    () => false
  );
}
