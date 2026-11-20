"use client";

import { cjk } from "@streamdown/cjk";
import { code } from "@streamdown/code";
import { math } from "@streamdown/math";
import { mermaid } from "@streamdown/mermaid";
import type { ComponentProps } from "react";
import { defaultComponents, Streamdown } from "streamdown";
import { loadsOnItsOwn } from "@/lib/chat-images";

const plugins = { cjk, code, math, mermaid };

const { a: Link, img: Image } = defaultComponents;

/**
 * An image only when it can't send anything anywhere (lib/chat-images.ts);
 * otherwise a link, which asks before it opens.
 */
function ReplyImage(props: ComponentProps<typeof Image>) {
  if (loadsOnItsOwn(props.src)) {
    return <Image {...props} />;
  }
  const src = typeof props.src === "string" ? props.src : undefined;
  return <Link href={src}>{props.alt ? `Image: ${props.alt}` : src}</Link>;
}

const components = { img: ReplyImage };

/** Streamdown and its plugins, loaded by `Markdown` when there's text to show. */
export function MarkdownBody(props: ComponentProps<typeof Streamdown>) {
  return (
    <Streamdown
      plugins={plugins}
      {...props}
      components={{ ...props.components, ...components }}
    />
  );
}
