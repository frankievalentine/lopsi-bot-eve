import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { readMemberAccess, writeMemberAccess } from "./member-access";

const NO_TOOLS = { bash: undefined, webFetch: undefined, webSearch: undefined };

function sandboxFile(domains: string[]): string {
  const file = writeMemberAccess({ sandboxDomains: domains })["sandbox.ts"];
  if (typeof file !== "string") {
    throw new Error("writeMemberAccess wrote no sandbox.ts");
  }
  return file;
}

const POLICY_EXPORT =
  /\/\*\*\n \* Also applied to chats already open[\s\S]*?\*\/\nexport function networkPolicy/u;

/** sandbox.ts as the dashboard wrote it before hooks/network.ts. */
function earlierForm(file: string): string {
  return file.replace(POLICY_EXPORT, "function networkPolicy");
}

describe("sandbox.ts", () => {
  it.each([[[]], [["registry.npmjs.org", "api.github.com"]]])(
    "reads back what it writes: %j",
    (domains) => {
      expect(
        readMemberAccess({ ...NO_TOOLS, sandbox: sandboxFile(domains) })
          .sandboxDomains
      ).toEqual(domains);
    }
  );

  it("exports networkPolicy for hooks/network.ts", () => {
    expect(sandboxFile([])).toContain("\nexport function networkPolicy()");
  });

  it("still reads the earlier form, so members not yet updated stay editable", () => {
    const earlier = earlierForm(sandboxFile(["registry.npmjs.org"]));
    expect(earlier).not.toContain("export function networkPolicy");
    expect(
      readMemberAccess({ ...NO_TOOLS, sandbox: earlier }).sandboxDomains
    ).toEqual(["registry.npmjs.org"]);
  });

  it("matches the template member's file", () => {
    const file = readFileSync("agents/lopsi/agent/sandbox.ts", "utf8");
    expect(
      readMemberAccess({ ...NO_TOOLS, sandbox: file }).sandboxDomains
    ).toEqual([]);
  });

  it("leaves a hand-edited file alone", () => {
    const edited = `${sandboxFile([])}// mine\n`;
    expect(
      readMemberAccess({ ...NO_TOOLS, sandbox: edited }).sandboxDomains
    ).toBeUndefined();
  });
});
