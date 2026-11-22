import { describe, expect, it } from "vitest";
import {
  type Attachment,
  type AttachmentPage,
  allAttachments,
  allowedFor,
  type ConnectorRecord,
  chatPath,
  toConnectors,
  unavailableReason,
} from "./connectors";
import { VercelApiError } from "./vercel-project";

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

describe("allAttachments", () => {
  function attachment(connectorId: string): Attachment {
    return { connectorId };
  }

  /** A fetcher serving these pages in order, keyed by the cursor that reaches each. */
  function pages(byCursor: Record<string, AttachmentPage>) {
    const queries: string[] = [];
    const fetchPage = (query: string) => {
      queries.push(query);
      const cursor = new URLSearchParams(query).get("cursor") ?? "";
      const page = byCursor[cursor];
      if (page === undefined) {
        throw new Error(`no page for cursor "${cursor}"`);
      }
      return Promise.resolve(page);
    };
    return { fetchPage, queries };
  }

  it("reads a single page", async () => {
    const { fetchPage, queries } = pages({
      "": { connectors: [attachment("scl_a")], pagination: { next: null } },
    });
    expect(await allAttachments(fetchPage)).toEqual([attachment("scl_a")]);
    expect(queries).toEqual(["limit=100"]);
  });

  it("follows each page's cursor to the next, in order", async () => {
    const { fetchPage, queries } = pages({
      "": { connectors: [attachment("scl_a")], pagination: { next: "c1" } },
      c1: { connectors: [attachment("scl_b")], pagination: { next: "c2" } },
      c2: { connectors: [attachment("scl_c")], pagination: { next: null } },
    });
    expect(
      (await allAttachments(fetchPage)).map((entry) => entry.connectorId)
    ).toEqual(["scl_a", "scl_b", "scl_c"]);
    expect(queries).toEqual([
      "limit=100",
      "limit=100&cursor=c1",
      "limit=100&cursor=c2",
    ]);
  });

  it("stops at a page with no pagination", async () => {
    const { fetchPage } = pages({ "": {} });
    expect(await allAttachments(fetchPage)).toEqual([]);
  });

  it("throws when a cursor comes back twice", async () => {
    const { fetchPage } = pages({
      "": { connectors: [], pagination: { next: "c1" } },
      c1: { connectors: [], pagination: { next: "c1" } },
    });
    await expect(allAttachments(fetchPage)).rejects.toThrow("twice");
  });
});

describe("unavailableReason", () => {
  it("tells a token that can't see the team from one Vercel didn't accept", () => {
    expect(unavailableReason(new VercelApiError(404, "/x"))).toBe("no-access");
    expect(unavailableReason(new VercelApiError(403, "/x"))).toBe("no-access");
    expect(unavailableReason(new VercelApiError(401, "/x"))).toBe("expired");
  });

  it("calls anything else refused", () => {
    expect(unavailableReason(new VercelApiError(500, "/x"))).toBe("refused");
    expect(unavailableReason(new Error("network"))).toBe("refused");
  });
});
