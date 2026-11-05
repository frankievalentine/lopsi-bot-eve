"use client";

import { cjk } from "@streamdown/cjk";
import { code } from "@streamdown/code";
import { math } from "@streamdown/math";
import { mermaid } from "@streamdown/mermaid";
import type { ComponentProps } from "react";
import { Streamdown } from "streamdown";

const plugins = { cjk, code, math, mermaid };

/** Streamdown and its plugins, loaded by `Markdown` when there's text to show. */
export function MarkdownBody(props: ComponentProps<typeof Streamdown>) {
  return <Streamdown plugins={plugins} {...props} />;
}
