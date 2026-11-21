import { describe, expect, it } from "vitest";
import {
  allowedFor,
  type ConnectorRecord,
  chatPath,
  connectorApproval,
  toConnectors,
} from "./connectors";

const PROJECT = "prj_here";
/** crew-core.mjs's rule for a connector name. */
const CREW_NAME = /^[a-z][a-z0-9-]{0,30}$/u;

function record(overrides: Partial<ConnectorRecord>): ConnectorRecord {
  return {
    id: "scl_1",
    name: "linear",
    service: "linear",
    uid: "linear/linear",
    ...overrides,
  };
}

describe("connectorApproval", () => {
  it("runs a tool the server marks read-only", () => {
    expect(connectorApproval({ toolAnnotations: { readOnlyHint: true } })).toBe(
      "not-applicable"
    );
  });

  it.each([
    ["no annotations", undefined],
    ["no readOnlyHint", { title: "Delete" }],
    ["readOnlyHint false", { readOnlyHint: false }],
    [
      "readOnlyHint and destructiveHint",
      { destructiveHint: true, readOnlyHint: true },
    ],
  ])("asks for a tool with %s", (_case, toolAnnotations) => {
    expect(connectorApproval({ toolAnnotations })).toBe("user-approval");
  });
});

describe("toConnectors", () => {
  it("makes an MCP connector from its server URL", () => {
    const [connector] = toConnectors(
      [
        record({
          connectionMethod: "mcp",
          data: { serverUrl: "https://mcp.linear.app/mcp" },
          serviceName: "Linear",
          supportedSubjectTypes: ["user"],
        }),
      ],
      PROJECT
    );
    expect(connector).toMatchObject({
      kind: "mcp",
      name: "linear",
      perPerson: true,
      serviceName: "Linear",
      url: "https://mcp.linear.app/mcp",
    });
  });

  it("treats every other connector as an API credential", () => {
    const [connector] = toConnectors(
      [
        record({
          connectionMethod: "api-key",
          name: "Stripe Live",
          service: "stripe",
          supportedSubjectTypes: ["app"],
        }),
      ],
      PROJECT
    );
    expect(connector).toMatchObject({
      kind: "api",
      name: "stripe-live",
      perPerson: false,
    });
    expect(connector?.url).toBeUndefined();
  });

  it("names connectors as crew.json accepts, oldest first, never twice", () => {
    const names = toConnectors(
      [
        record({ createdAt: 2, id: "scl_b", name: "My Slack" }),
        record({ createdAt: 1, id: "scl_a", name: "my_slack" }),
        record({ createdAt: 3, id: "scl_c", name: "42" }),
        record({ createdAt: 4, id: "scl_d", name: "x".repeat(50) }),
      ],
      PROJECT
    ).map((connector) => connector.name);
    expect(names).toEqual(["my-slack", "my-slack-2", "c-42", "x".repeat(31)]);
    for (const name of names) {
      expect(name).toMatch(CREW_NAME);
    }
  });

  it("keeps only this project's event paths, with Connect's default", () => {
    const [connector] = toConnectors(
      [
        record({
          service: "slack",
          supportsTriggers: true,
          triggerDestinations: [
            { path: "/eve/lopsi/v1/slack", projectId: PROJECT },
            { projectId: PROJECT },
            { path: "/elsewhere", projectId: "prj_other" },
          ],
        }),
      ],
      PROJECT
    );
    expect(connector?.triggers?.paths).toEqual([
      "/eve/lopsi/v1/slack",
      "/slack",
    ]);
  });
});

describe("allowedFor", () => {
  const list = toConnectors(
    [record({ id: "scl_a", name: "a" }), record({ id: "scl_b", name: "b" })],
    PROJECT
  );

  it("allows every connector when crew.json names none", () => {
    expect(allowedFor(list, undefined)).toHaveLength(2);
  });

  it("allows only the ones crew.json names", () => {
    expect(allowedFor(list, ["b"]).map((entry) => entry.id)).toEqual(["scl_b"]);
  });
});

describe("chatPath", () => {
  it("is the member's channel route", () => {
    expect(chatPath("lopsi", "telegram")).toBe("/eve/lopsi/v1/telegram");
  });
});
