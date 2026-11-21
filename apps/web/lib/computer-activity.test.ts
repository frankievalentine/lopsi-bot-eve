import type { CallObservation } from "eve/events";
import { describe, expect, it } from "vitest";
import { computerActivity } from "./computer-activity";

let minute = 0;

function call(
  name: string,
  input: CallObservation["input"],
  output: CallObservation["output"]
): CallObservation {
  minute += 1;
  const at = `2026-11-20T10:${String(minute).padStart(2, "0")}:00.000Z`;
  return {
    callId: `call-${minute}`,
    endedAt: at,
    input,
    kind: "tool",
    label: name,
    name,
    output,
    startedAt: at,
    state: "completed",
  };
}

function write(path: string, content: string): CallObservation {
  return call(
    "write_file",
    { content, filePath: path },
    { created: true, path }
  );
}

function edit(
  path: string,
  edits: { newText: string; oldText: string }[]
): CallObservation {
  return call(
    "edit_file",
    { edits, path },
    { path, replacements: edits.length }
  );
}

describe("computerActivity", () => {
  it("applies an edit to the text the chat last saw", () => {
    const { files } = computerActivity([
      write("/workspace/notes.md", "one\ntwo\nthree\n"),
      edit("notes.md", [
        { newText: "2", oldText: "two" },
        { newText: "1", oldText: "one" },
      ]),
    ]);
    expect(files).toHaveLength(1);
    expect(files[0]).toMatchObject({
      content: "1\n2\nthree\n",
      how: "edited",
      path: "notes.md",
    });
  });

  it("leaves the content out when an edit doesn't match exactly once", () => {
    const { files } = computerActivity([
      write("/workspace/notes.md", "a\na\n"),
      edit("./notes.md", [{ newText: "b", oldText: "a" }]),
    ]);
    expect(files[0]).toMatchObject({ how: "edited", path: "notes.md" });
    expect(files[0]?.content).toBeUndefined();
  });

  it("leaves the content out when the chat never saw the file", () => {
    const { files } = computerActivity([
      edit("/workspace/app.ts", [{ newText: "let", oldText: "const" }]),
    ]);
    expect(files[0]).toMatchObject({ how: "edited", path: "app.ts" });
    expect(files[0]?.content).toBeUndefined();
  });

  it("doesn't rebuild from a partial read", () => {
    const { files } = computerActivity([
      call(
        "read_file",
        { filePath: "/workspace/log.txt" },
        { content: "1: start", path: "/workspace/log.txt", truncated: true }
      ),
      edit("log.txt", [{ newText: "begin", oldText: "start" }]),
    ]);
    expect(files[0]?.content).toBeUndefined();
  });
});
