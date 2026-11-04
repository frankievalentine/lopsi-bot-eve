import { useEffect } from "react";
import { flushSync } from "react-dom";
import { createRoot } from "react-dom/client";
import { CrewIcon } from "@/components/crew-icon";
import {
  KINDS,
  type MascotKind,
  type MascotMood,
  useReducedMotion,
} from "@/components/mascot";

/**
 * The tab's icon. It shows an agent only when there is something to report: one that
 * needs you, else the open agent while it works or once it is done. Otherwise it
 * rotates through the crew, or holds Chief when motion is reduced.
 */

export type FaviconFrame = { kind: MascotKind; mood: MascotMood };

export const ROTATE_MS = 5000;

const ROTATION: FaviconFrame[] = (Object.keys(KINDS) as MascotKind[]).map(
  (kind) => ({ kind, mood: "idle" })
);

/** The agent the tab should show, or null to rotate. */
export function faviconFor<A extends { id: string; kind: MascotKind }>(
  crew: A[],
  moodOf: (agent: A) => MascotMood,
  openId: string | undefined
): FaviconFrame | null {
  const needs = crew.find((a) => moodOf(a) === "needs");
  if (needs) {
    return { kind: needs.kind, mood: "needs" };
  }
  const open = crew.find((a) => a.id === openId);
  if (!open) {
    return null;
  }
  const mood = moodOf(open);
  return mood === "thinking" || mood === "done"
    ? { kind: open.kind, mood }
    : null;
}

const urls = new Map<string, string>();

function frameKey(frame: FaviconFrame) {
  return `${frame.kind}:${frame.mood}`;
}

// Renders a frame once, outside the app's tree, and keeps it as a still SVG. A Mascot
// left mounted would keep blinking for nobody.
function frameUrl(frame: FaviconFrame): string {
  const key = frameKey(frame);
  const cached = urls.get(key);
  if (cached) {
    return cached;
  }
  const host = document.createElement("div");
  const root = createRoot(host);
  flushSync(() =>
    root.render(<CrewIcon kind={frame.kind} mood={frame.mood} />)
  );
  const svg = new XMLSerializer().serializeToString(host.firstElementChild!);
  root.unmount();
  const url = `data:image/svg+xml,${encodeURIComponent(svg)}`;
  urls.set(key, url);
  return url;
}

function frameOf(key: string): FaviconFrame {
  const [kind, mood] = key.split(":") as [MascotKind, MascotMood];
  return { kind, mood };
}

/** Points the page's SVG icon at `fixed`, or rotates while it is null. */
export function useFavicon(fixed: FaviconFrame | null) {
  const reduce = useReducedMotion();
  // A key, not the frame, so a new object for the same frame keeps the rotation going.
  const key = fixed ? frameKey(fixed) : null;

  useEffect(() => {
    const link = document.querySelector<HTMLLinkElement>(
      'link[rel="icon"][type="image/svg+xml"]'
    );
    if (!link) {
      return;
    }
    const show = (frame: FaviconFrame) => {
      link.href = frameUrl(frame);
    };
    let i = 0;
    let timer: ReturnType<typeof setInterval> | undefined;
    // Rendering waits for the next task: React does not allow flushSync inside an effect.
    const start = setTimeout(() => {
      if (key) {
        return show(frameOf(key));
      }
      show(ROTATION[0]!);
      if (reduce) {
        return;
      }
      timer = setInterval(() => {
        i = (i + 1) % ROTATION.length;
        show(ROTATION[i]!);
      }, ROTATE_MS);
    }, 0);
    return () => {
      clearTimeout(start);
      clearInterval(timer);
    };
  }, [key, reduce]);
}
