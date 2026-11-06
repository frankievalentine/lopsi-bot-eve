import { describe, expect, it, vi } from "vitest";
import { protectEnv } from "./vercel-api.mjs";

const TOKEN = "the-token-value";

/** A Vercel API with these rows, which records what's written. */
function fakeApi(envs) {
  return vi.fn((path, init) => {
    if (init?.method === "PATCH") {
      return {};
    }
    return path.endsWith("/env") ? { envs } : { value: TOKEN };
  });
}

const row = (fields) => ({ id: "env_1", key: "SECRET", ...fields });

describe("protectEnv", () => {
  it("writes the same value back as a Secret, for the same targets", () => {
    const api = fakeApi([
      row({ target: ["production", "preview"], type: "encrypted" }),
    ]);
    expect(protectEnv(api, "prj", "SECRET")).toEqual({
      converted: 1,
      skipped: 0,
    });
    expect(api).toHaveBeenCalledWith("/v9/projects/prj/env/env_1", {
      body: {
        target: ["production", "preview"],
        type: "sensitive",
        value: TOKEN,
      },
      method: "PATCH",
    });
  });

  it("leaves a variable that's already a Secret", () => {
    const api = fakeApi([row({ target: ["production"], type: "sensitive" })]);
    expect(protectEnv(api, "prj", "SECRET").converted).toBe(0);
    expect(api).toHaveBeenCalledTimes(1);
  });

  it("leaves other variables", () => {
    const api = fakeApi([
      row({ key: "OTHER", target: ["production"], type: "plain" }),
    ]);
    expect(protectEnv(api, "prj", "SECRET").converted).toBe(0);
  });

  it("reports a variable that includes development, which can't be a Secret", () => {
    const api = fakeApi([
      row({ target: ["production", "development"], type: "encrypted" }),
    ]);
    expect(protectEnv(api, "prj", "SECRET")).toEqual({
      converted: 0,
      skipped: 1,
    });
    expect(api).toHaveBeenCalledTimes(1);
  });

  it("converts each row of a variable split across targets", () => {
    const api = fakeApi([
      row({ target: ["production"], type: "encrypted" }),
      row({ id: "env_2", target: ["preview"], type: "encrypted" }),
    ]);
    expect(protectEnv(api, "prj", "SECRET").converted).toBe(2);
  });
});
