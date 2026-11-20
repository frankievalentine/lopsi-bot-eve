import { describe, expect, it } from "vitest";
import { loadsOnItsOwn } from "./chat-images";

describe("loadsOnItsOwn", () => {
  it("loads this site's own paths", () => {
    expect(loadsOnItsOwn("/mascots/skipper.png")).toBe(true);
  });

  it.each([
    "https://attacker.example/pixel.png?d=secret",
    "http://attacker.example/pixel.png",
    "//attacker.example/pixel.png",
    "/\\attacker.example/pixel.png",
    "data:image/png;base64,iVBORw0KGgo=",
    "pixel.png",
    "",
    undefined,
  ])("links %s", (src) => {
    expect(loadsOnItsOwn(src)).toBe(false);
  });
});
