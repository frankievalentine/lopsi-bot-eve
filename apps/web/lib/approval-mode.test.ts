import type { ApprovalContext } from "eve/tools/approval";
import { describe, expect, it } from "vitest";
import {
  approvalModeOf,
  changeApproval,
  connectorApproval,
  isReadOnly,
  serviceCallKind,
} from "./approval-mode";
import { crewSource, parseCrewJson, serializeCrewJson } from "./crew-core.mjs";

/** A call's context with just what these policies read. */
function call(toolAnnotations?: ApprovalContext["toolAnnotations"]) {
  return {
    callId: "call_1",
    toolInput: {},
    toolName: "linear__create_issue",
    ...(toolAnnotations === undefined ? {} : { toolAnnotations }),
  } as unknown as ApprovalContext;
}

describe("approvalModeOf", () => {
  it("reads crew.json approvals", () => {
    expect(approvalModeOf({ approvals: "once" })).toBe("once");
    expect(approvalModeOf({ approvals: "auto" })).toBe("auto");
    expect(approvalModeOf({ approvals: "never" })).toBe("never");
  });

  it("asks every time when it's missing or unknown", () => {
    expect(approvalModeOf({})).toBe("always");
    expect(approvalModeOf({ approvals: "sometimes" })).toBe("always");
  });
});

describe("changeApproval", () => {
  it("asks for every change with always", async () => {
    expect(await changeApproval("always")(call())).toBe("user-approval");
  });

  it("lets every change run with never", async () => {
    expect(await changeApproval("never")(call())).toBe("not-applicable");
  });
});

describe("isReadOnly", () => {
  it("trusts readOnlyHint unless the tool also says it's destructive", () => {
    expect(isReadOnly({ readOnlyHint: true })).toBe(true);
    expect(isReadOnly({ destructiveHint: true, readOnlyHint: true })).toBe(
      false
    );
    expect(isReadOnly({ readOnlyHint: false })).toBe(false);
    expect(isReadOnly({ title: "Delete" })).toBe(false);
    expect(isReadOnly(undefined)).toBe(false);
  });
});

describe("connectorApproval", () => {
  it.each(["always", "once", "auto", "never"] as const)(
    "runs a read-only tool in %s mode without asking or reviewing",
    async (mode) => {
      expect(await connectorApproval(mode)(call({ readOnlyHint: true }))).toBe(
        "not-applicable"
      );
    }
  );

  it("asks for any other tool in always mode", async () => {
    expect(await connectorApproval("always")(call())).toBe("user-approval");
    expect(
      await connectorApproval("always")(
        call({ destructiveHint: true, readOnlyHint: true })
      )
    ).toBe("user-approval");
  });

  it("runs any tool in never mode", async () => {
    expect(await connectorApproval("never")(call())).toBe("not-applicable");
  });
});

describe("crew.json approvals", () => {
  const base = { mascot: "navigator" as const, name: "Scout" };

  it("is read, written and carried into the crew list", () => {
    const text = serializeCrewJson({ ...base, approvals: "once" });
    expect(JSON.parse(text).approvals).toBe("once");
    const parsed = parseCrewJson(text);
    expect(parsed.ok && parsed.data.approvals).toBe("once");
    expect(
      crewSource([{ data: { ...base, approvals: "auto" }, id: "scout" }])
    ).toContain('"approvals": "auto"');
  });

  it("leaves the default out, so most files don't change", () => {
    expect(
      JSON.parse(serializeCrewJson({ ...base, approvals: "always" }))
    ).not.toHaveProperty("approvals");
    expect(crewSource([{ data: base, id: "scout" }])).not.toContain(
      '"approvals":'
    );
  });

  it("refuses an unknown mode", () => {
    expect(
      parseCrewJson(JSON.stringify({ ...base, approvals: "sometimes" })).ok
    ).toBe(false);
  });
});

describe("serviceCallKind", () => {
  it("treats a website nobody approved as new, whatever the method", () => {
    expect(serviceCallKind({ approvedWebsite: false, method: "GET" })).toBe(
      "new-website"
    );
    expect(serviceCallKind({ approvedWebsite: false, method: "POST" })).toBe(
      "new-website"
    );
  });

  it("separates reads from changes on an approved website", () => {
    expect(serviceCallKind({ approvedWebsite: true, method: "GET" })).toBe(
      "read"
    );
    for (const method of ["POST", "PUT", "PATCH", "DELETE"]) {
      expect(serviceCallKind({ approvedWebsite: true, method })).toBe("change");
    }
  });
});
