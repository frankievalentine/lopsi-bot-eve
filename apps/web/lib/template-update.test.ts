import { describe, expect, it } from "vitest";
import {
  blobSha,
  changeLink,
  contentOf,
  describePlan,
  GENERATED,
  planUpdate,
  rewriteMemberId,
  TEMPLATE_FILE,
} from "./template-update.mjs";

type Files = Readonly<Record<string, string>>;

const COMPARE_LINK =
  /^https:\/\/github\.com\/a\/b\/compare\/v0\.1\.0\.\.\.v0\.2\.0#diff-[0-9a-f]{64}$/u;

function treeOf(files: Files, modes: Readonly<Record<string, string>> = {}) {
  return new Map(
    Object.entries(files).map(([path, content]) => [
      path,
      { mode: modes[path] ?? "100644", sha: blobSha(content) },
    ])
  );
}

function readerOf(files: Files) {
  return (path: string) =>
    Promise.resolve(
      files[path] === undefined ? undefined : Buffer.from(files[path])
    );
}

function plan(
  old: Files,
  next: Files,
  mine: Files,
  modes: Readonly<Record<string, string>> = {}
) {
  return planUpdate({
    mine: treeOf(mine),
    newTree: treeOf(next, modes),
    oldTree: treeOf(old),
    readMine: readerOf(mine),
    readNew: readerOf(next),
    readOld: readerOf(old),
  });
}

const RESEND = (id: string, body: string) =>
  `const MEMBER_ID = "${id}";\n${body}\n`;

describe("blobSha", () => {
  it("matches git's hash for a file", () => {
    // `printf 'hello\n' | git hash-object --stdin`
    expect(blobSha("hello\n")).toBe("ce013625030ba8dba906f756967f9e9ca394464a");
  });
});

describe("planUpdate", () => {
  it("updates a file you haven't changed", async () => {
    const result = await plan(
      { "docs/a.md": "old" },
      { "docs/a.md": "new" },
      { "docs/a.md": "old" }
    );
    expect(result.changes).toEqual([
      { mode: "100644", path: "docs/a.md", source: "docs/a.md" },
    ]);
    expect(result.kept).toEqual([]);
  });

  it("keeps and lists a file you changed", async () => {
    const result = await plan(
      { "docs/a.md": "old" },
      { "docs/a.md": "new" },
      { "docs/a.md": "mine" }
    );
    expect(result.changes).toEqual([]);
    expect(result.kept).toEqual([
      { path: "docs/a.md", reason: "edited", source: "docs/a.md" },
    ]);
  });

  it("leaves a file that already has the new version", async () => {
    const result = await plan(
      { "docs/a.md": "old" },
      { "docs/a.md": "new" },
      { "docs/a.md": "new" }
    );
    expect(result).toEqual({ changes: [], crewChanged: false, kept: [] });
  });

  it("ignores files the template didn't change, even ones you did", async () => {
    const result = await plan(
      { "docs/a.md": "same" },
      { "docs/a.md": "same" },
      { "docs/a.md": "mine" }
    );
    expect(result).toEqual({ changes: [], crewChanged: false, kept: [] });
  });

  it("adds new files and deletes removed ones you hadn't changed", async () => {
    const result = await plan(
      { "scripts/edited.mjs": "x", "scripts/gone.mjs": "x" },
      { "scripts/new.mjs": "y" },
      { "scripts/edited.mjs": "mine", "scripts/gone.mjs": "x" }
    );
    expect(result.changes).toEqual([
      { delete: true, path: "scripts/gone.mjs" },
      { mode: "100644", path: "scripts/new.mjs", source: "scripts/new.mjs" },
    ]);
    expect(result.kept).toEqual([
      {
        path: "scripts/edited.mjs",
        reason: "edited",
        source: "scripts/edited.mjs",
      },
    ]);
  });

  it("lists a file you deleted that the template changed", async () => {
    const result = await plan({ "a.md": "old" }, { "a.md": "new" }, {});
    expect(result.kept).toEqual([
      { path: "a.md", reason: "edited", source: "a.md" },
    ]);
  });

  it("carries the new file mode", async () => {
    const result = await plan(
      { "bin/run": "old" },
      { "bin/run": "new" },
      { "bin/run": "old" },
      { "bin/run": "100755" }
    );
    expect(result.changes).toEqual([
      { mode: "100755", path: "bin/run", source: "bin/run" },
    ]);
  });

  it("leaves symlinks and submodules", async () => {
    const result = await plan({}, { link: "target" }, {}, { link: "120000" });
    expect(result.changes).toEqual([]);
    expect(result.kept).toEqual([
      { path: "link", reason: "unsupported", source: "link" },
    ]);
  });

  it("never copies the generated crew list", async () => {
    const result = await plan(
      { [GENERATED]: "a" },
      { [GENERATED]: "b" },
      { [GENERATED]: "a" }
    );
    expect(result.changes).toEqual([]);
  });

  describe("crew members", () => {
    const hook = "agents/lopsi/agent/hooks/chats.ts";
    const members = {
      "agents/lopsi/agent/agent.ts": "x",
      "agents/scout/agent/agent.ts": "x",
    };

    it("updates every member's unchanged copy of a shared file", async () => {
      const result = await plan(
        { [hook]: "old" },
        { [hook]: "new" },
        {
          ...members,
          [hook]: "old",
          "agents/scout/agent/hooks/chats.ts": "old",
        }
      );
      expect(result.changes).toEqual([
        { mode: "100644", path: hook, source: hook },
        {
          memberId: "scout",
          mode: "100644",
          path: "agents/scout/agent/hooks/chats.ts",
          source: hook,
        },
      ]);
    });

    it("keeps a member's edited copy and updates the others", async () => {
      const result = await plan(
        { [hook]: "old" },
        { [hook]: "new" },
        {
          ...members,
          [hook]: "old",
          "agents/scout/agent/hooks/chats.ts": "scout's own",
        }
      );
      expect(result.changes.map((change) => change.path)).toEqual([hook]);
      expect(result.kept).toEqual([
        {
          path: "agents/scout/agent/hooks/chats.ts",
          reason: "edited",
          source: hook,
        },
      ]);
    });

    it("compares and writes each member's copy with its own id", async () => {
      const resend = "agents/lopsi/agent/channels/resend.ts";
      const scout = "agents/scout/agent/channels/resend.ts";
      const next = { [resend]: RESEND("lopsi", "new") };
      const result = await plan({ [resend]: RESEND("lopsi", "old") }, next, {
        ...members,
        [resend]: RESEND("lopsi", "old"),
        [scout]: RESEND("scout", "old"),
      });
      const copy = result.changes.find((change) => change.path === scout);
      expect(copy).toEqual({
        memberId: "scout",
        mode: "100644",
        path: scout,
        source: resend,
      });
      const written = await contentOf(
        copy as Parameters<typeof contentOf>[0],
        readerOf(next)
      );
      expect(written.toString()).toBe(RESEND("scout", "new"));
    });

    it("adds a new shared file to every member", async () => {
      const result = await plan({}, { [hook]: "new" }, members);
      expect(result.changes.map((change) => change.path)).toEqual([
        hook,
        "agents/scout/agent/hooks/chats.ts",
      ]);
    });

    it("updates the template member's own files only in it", async () => {
      const slack = "agents/lopsi/agent/channels/slack.ts";
      const result = await plan(
        { [slack]: "old" },
        { [slack]: "new" },
        { ...members, [slack]: "old" }
      );
      expect(result.changes.map((change) => change.path)).toEqual([slack]);
    });

    it("skips the template member's own files when it's gone", async () => {
      const slack = "agents/lopsi/agent/channels/slack.ts";
      const result = await plan(
        { [slack]: "old" },
        { [slack]: "new" },
        { "agents/scout/agent/agent.ts": "x" }
      );
      expect(result).toEqual({ changes: [], crewChanged: false, kept: [] });
    });

    it("says when a crew.json changed", async () => {
      const crew = "agents/lopsi/crew.json";
      const result = await plan(
        { [crew]: "old" },
        { [crew]: "new" },
        { ...members, [crew]: "old" }
      );
      expect(result.crewChanged).toBe(true);
    });
  });

  describe("template.json", () => {
    it("takes the new version and keeps the repository it points at", async () => {
      const result = await plan(
        { [TEMPLATE_FILE]: '{"repository":"a/b","version":"0.1.0"}' },
        { [TEMPLATE_FILE]: '{"repository":"a/b","version":"0.2.0"}' },
        { [TEMPLATE_FILE]: '{"repository":"me/fork","version":"0.1.0"}' }
      );
      expect(result.changes).toEqual([
        {
          content: `${JSON.stringify({ repository: "me/fork", version: "0.2.0" }, null, 2)}\n`,
          mode: "100644",
          path: TEMPLATE_FILE,
        },
      ]);
    });
  });
});

describe("rewriteMemberId", () => {
  it("gives a file its member's id, or nothing when it has none", () => {
    expect(rewriteMemberId(RESEND("lopsi", "x"), "scout")).toBe(
      RESEND("scout", "x")
    );
    expect(rewriteMemberId("no id here", "scout")).toBeUndefined();
  });
});

describe("describePlan", () => {
  it("lists what was kept, with a link to each change", async () => {
    const result = await plan(
      { "a.md": "old", "pnpm-lock.yaml": "old" },
      { "a.md": "new", "pnpm-lock.yaml": "new" },
      { "a.md": "mine", "pnpm-lock.yaml": "mine" }
    );
    const text = describePlan(result, {
      from: "0.1.0",
      repository: "a/b",
      to: "0.2.0",
    });
    expect(text).toContain(
      `- \`a.md\`: [the template's change](${changeLink("a/b", "0.1.0", "0.2.0", "a.md")})`
    );
    expect(text).toContain("run `pnpm install`");
    expect(changeLink("a/b", "0.1.0", "0.2.0", "a.md")).toMatch(COMPARE_LINK);
  });
});
