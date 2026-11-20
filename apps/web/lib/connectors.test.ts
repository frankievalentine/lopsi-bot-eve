import { describe, expect, it } from "vitest";
import { connectorApproval } from "./connectors";
import catalog from "./connectors.json";

const approval = connectorApproval({
  approve: ["send-email"],
  id: "mail",
});

describe("connectorApproval", () => {
  it("runs a tool the server marks read-only", () => {
    expect(
      approval({
        toolAnnotations: { readOnlyHint: true },
        toolName: "mail__list-emails",
      })
    ).toBe("not-applicable");
  });

  it.each([
    ["no annotations", undefined],
    ["no readOnlyHint", { title: "Delete" }],
    ["readOnlyHint false", { readOnlyHint: false }],
  ])("asks for a tool with %s", (_case, toolAnnotations) => {
    expect(approval({ toolAnnotations, toolName: "mail__delete-email" })).toBe(
      "user-approval"
    );
  });

  it.each(["mail__send-email", "send-email"])(
    "asks for %s on the approve list, even marked read-only",
    (toolName) => {
      expect(
        approval({ toolAnnotations: { readOnlyHint: true }, toolName })
      ).toBe("user-approval");
    }
  );

  it("only strips its own connector's prefix", () => {
    expect(
      approval({
        toolAnnotations: { readOnlyHint: true },
        toolName: "other__send-email",
      })
    ).toBe("not-applicable");
  });
});

describe("connectors.json", () => {
  it.each(
    catalog.flatMap((connector) =>
      connector.approve && connector.tools && "allow" in connector.tools
        ? [[connector.id, connector.approve, connector.tools.allow] as const]
        : []
    )
  )("%s asks only for tools it shows the crew", (_id, approve, allow) => {
    expect(approve.filter((tool) => !allow.includes(tool))).toEqual([]);
  });
});
