import { describe, expect, it } from "vitest";
import { safeRedirect } from "./safe-redirect";

describe("safeRedirect", () => {
  it.each([
    ["/c/lopsi", "/c/lopsi"],
    ["/c/lopsi?a=1#b", "/c/lopsi?a=1#b"],
  ])("keeps the same-origin path %s", (target, result) => {
    expect(safeRedirect(target)).toBe(result);
  });

  it.each([
    "https://evil.example",
    "//evil.example",
    "/\\evil.example",
    "\\\\evil.example",
    "javascript:alert(1)",
    "evil",
    "",
  ])("refuses %s", (target) => {
    expect(safeRedirect(target)).toBe("/");
  });

  it("falls back to the home page", () => {
    expect(safeRedirect(null)).toBe("/");
    expect(safeRedirect(undefined)).toBe("/");
  });
});
