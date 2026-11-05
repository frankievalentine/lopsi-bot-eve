"use client";

import { type ComponentProps, lazy, Suspense } from "react";
import type { MarkdownBody } from "./markdown-body";

const LazyBody = lazy(() =>
  import("./markdown-body").then((module) => ({
    default: module.MarkdownBody,
  }))
);

/**
 * Rendered markdown. Mermaid, math and code highlighting are large, so they load
 * with the first text to show; until then the text appears as it is.
 */
export function Markdown(props: ComponentProps<typeof MarkdownBody>) {
  return (
    <Suspense
      fallback={
        <div className={props.className} style={{ whiteSpace: "pre-wrap" }}>
          {props.children}
        </div>
      }
    >
      <LazyBody {...props} />
    </Suspense>
  );
}
