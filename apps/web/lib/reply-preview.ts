const CODE_BLOCK = /```[\s\S]*?```/gu;
const LINK = /!?\[(?<text>[^\]]*)\]\([^)]*\)/gu;
const LINE_MARKER = /^\s{0,3}(?:#{1,6}|[-*+]|\d+\.|>)\s+/gmu;
const TABLE_ROW = /^\s*\|.*$/gmu;
const EMPHASIS = /\*\*|__|~~|`|\*/gu;

/** A reply as plain text, for a one-line preview: its markdown would show as symbols. */
export function plainReply(reply: string): string {
  return reply
    .replace(CODE_BLOCK, " ")
    .replace(TABLE_ROW, " ")
    .replace(LINK, "$<text>")
    .replace(LINE_MARKER, "")
    .replace(EMPHASIS, "");
}
