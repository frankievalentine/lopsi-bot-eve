import { describe, expect, it } from "vitest";
import { availableUpdate, checkForUpdate } from "./template-version";

const release = (tag: string, extra: object = {}) => ({
  html_url: `https://example.com/${tag}`,
  tag_name: tag,
  ...extra,
});

describe("availableUpdate", () => {
  it("finds the newest release after this version", () => {
    expect(
      availableUpdate(
        [release("v0.2.0"), release("v0.10.0"), release("v0.1.0")],
        "0.1.0"
      )
    ).toEqual({
      security: false,
      url: "https://example.com/v0.10.0",
      version: "0.10.0",
    });
  });

  it("has nothing to offer on the newest version", () => {
    expect(availableUpdate([release("v0.1.0")], "0.1.0")).toBeUndefined();
    expect(availableUpdate([release("v0.0.9")], "0.1.0")).toBeUndefined();
    expect(availableUpdate([], "0.1.0")).toBeUndefined();
  });

  it("skips drafts, prereleases and other tags", () => {
    expect(
      availableUpdate(
        [
          release("v0.2.0", { draft: true }),
          release("v0.3.0", { prerelease: true }),
          release("v1.0.0-rc.1"),
          release("nightly"),
        ],
        "0.1.0"
      )
    ).toBeUndefined();
  });

  it("flags a security fix in any release since this version", () => {
    const update = availableUpdate(
      [
        release("v0.3.0", { name: "v0.3.0" }),
        release("v0.2.0", { name: "v0.2.0: Security fixes" }),
        release("v0.1.0", { name: "v0.1.0: Security fixes" }),
      ],
      "0.1.0"
    );
    expect(update?.version).toBe("0.3.0");
    expect(update?.security).toBe(true);
  });

  it("ignores a security fix this version already has", () => {
    expect(
      availableUpdate(
        [
          release("v0.3.0"),
          release("v0.1.0", { name: "v0.1.0: Security fixes" }),
        ],
        "0.1.0"
      )?.security
    ).toBe(false);
  });
});

describe("checkForUpdate", () => {
  it.each([
    [
      "GitHub's refusal",
      () => Promise.resolve(new Response("", { status: 403 })),
    ],
    ["a network failure", () => Promise.reject(new Error("offline"))],
    ["a malformed answer", () => Promise.resolve(new Response("not json"))],
  ])("treats %s as no update", async (_name, send) => {
    await expect(checkForUpdate(send as typeof fetch)).resolves.toBeUndefined();
  });
});
