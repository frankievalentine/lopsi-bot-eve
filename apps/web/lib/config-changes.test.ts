import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  ConfigConflictError,
  type MemberConfig,
  memberEditFiles,
  readMemberConfig,
} from "./config-changes";
import type { BranchSnapshot } from "./github";

const ROOT = join(import.meta.dirname, "../../..");
const AGENT = "agents/lopsi/agent";

/** Fixed, so that editing Lopsi from the dashboard can't fail these tests. */
const FIXTURES: Readonly<Record<string, string>> = {
  "agents/lopsi/crew.json": JSON.stringify({
    mascot: "skipper",
    name: "Lopsi",
    role: "General helper",
    suggestions: ["First prompt", "Second prompt"],
  }),
  [`${AGENT}/instructions.md`]: "Be helpful.\n",
};

/** A crew member as the branch would hold it, with the template's other files. */
const snapshot: BranchSnapshot = {
  commit: "test",
  paths: new Set([
    "agents/lopsi/crew.json",
    "apps/web/lib/crew.generated.ts",
    `${AGENT}/agent.ts`,
    `${AGENT}/instructions.md`,
    `${AGENT}/limits.ts`,
    `${AGENT}/sandbox.ts`,
    `${AGENT}/tools/web_fetch.ts`,
  ]),
  readFile: (path) =>
    path in FIXTURES
      ? Promise.resolve(FIXTURES[path])
      : readFile(join(ROOT, path), "utf8").catch(() => undefined),
};

async function current(): Promise<MemberConfig> {
  const config = await readMemberConfig(snapshot, "lopsi");
  if (config === undefined) {
    throw new Error("The template has no lopsi crew member.");
  }
  return config;
}

/** The form's copy: validation returns objects with their keys in another order. */
function reordered<T>(value: T): T {
  if (Array.isArray(value)) {
    return value.map(reordered) as T;
  }
  if (typeof value === "object" && value !== null) {
    return Object.fromEntries(
      Object.entries(value)
        .reverse()
        .map(([key, entry]) => [key, reordered(entry)])
    ) as T;
  }
  return value;
}

const edit = (from: MemberConfig, to: MemberConfig) =>
  memberEditFiles(snapshot, "lopsi", from, to);

describe("memberEditFiles", () => {
  it("doesn't count key order as someone else's change", async () => {
    const config = await current();
    await expect(edit(reordered(config), config)).resolves.toEqual({});
  });

  it("writes a role change to the crew files only", async () => {
    const config = await current();
    const files = await edit(config, {
      ...config,
      crew: { ...config.crew, role: "Tester" },
    });
    expect(Object.keys(files).sort()).toEqual([
      "agents/lopsi/crew.json",
      "apps/web/lib/crew.generated.ts",
    ]);
  });

  it("writes instructions to instructions.md, ending in a newline", async () => {
    const config = await current();
    const files = await edit(config, { ...config, instructions: "New" });
    expect(files).toEqual({ [`${AGENT}/instructions.md`]: "New\n" });
  });

  it("rejects a change someone else made to the role", async () => {
    const config = await current();
    const stale = { ...config, crew: { ...config.crew, role: "Stale" } };
    await expect(edit(stale, config)).rejects.toThrow(ConfigConflictError);
  });

  it("rejects a change someone else made to the instructions", async () => {
    const config = await current();
    await expect(
      edit({ ...config, instructions: "Stale" }, config)
    ).rejects.toThrow(ConfigConflictError);
  });

  it("counts reordered suggestions as a change", async () => {
    const config = await current();
    const suggestions = [...(config.crew.suggestions ?? [])].reverse();
    await expect(
      edit({ ...config, crew: { ...config.crew, suggestions } }, config)
    ).rejects.toThrow(ConfigConflictError);
  });

  it("rejects an edit to a member that's gone", async () => {
    const config = await current();
    await expect(
      memberEditFiles(snapshot, "nobody", config, config)
    ).rejects.toThrow(ConfigConflictError);
  });
});
