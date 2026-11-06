import { describe, expect, it } from "vitest";
import { plainReply } from "./reply-preview";

describe("plainReply", () => {
  it.each([
    ["**bold** and `code`", "bold and code"],
    ["## Heading", "Heading"],
    ["- item", "item"],
    ["[a link](https://example.com)", "a link"],
    ["before\n```js\nconst a = 1;\n```\nafter", "before\n \nafter"],
    ["keeps file_name.ts", "keeps file_name.ts"],
  ])("%s", (reply, plain) => {
    expect(plainReply(reply)).toBe(plain);
  });

  it("drops table rows", () => {
    expect(plainReply("Totals:\n| a | b |\n| --- | --- |").trim()).toBe(
      "Totals:"
    );
  });
});
