import { describe, expect, it } from "vitest";
import {
  planRemoval,
  runRemoval,
  type VercelCall,
  VercelCallError,
  vercelCaller,
} from "./project-removal";

const PROJECT = "prj_ours";

const STORES = [
  {
    id: "store_ours",
    name: "chats",
    projectsMetadata: [{ projectId: PROJECT }],
    totalConnectedProjects: 1,
    type: "blob",
  },
  {
    id: "store_shared",
    name: "shared-blob",
    projectsMetadata: [{ projectId: PROJECT }, { projectId: "prj_other" }],
    totalConnectedProjects: 2,
    type: "blob",
  },
  {
    id: "store_redis",
    name: "redis",
    projectsMetadata: [{ projectId: PROJECT }],
    totalConnectedProjects: 1,
    type: "integration",
  },
  {
    id: "store_unrelated",
    name: "not-ours",
    projectsMetadata: [{ projectId: "prj_other" }],
    totalConnectedProjects: 1,
    type: "blob",
  },
];

/** A Vercel API with a connector of our own, and one another project shares. */
function fakeVercel(overrides: Record<string, () => unknown> = {}) {
  const deleted: string[] = [];
  const responses: Record<string, () => unknown> = {
    "/v1/storage/stores": () => ({ stores: STORES }),
    "/v2/connect/connectors/scl_ours/projects": () => ({
      projects: [{ projectId: PROJECT }],
    }),
    "/v2/connect/connectors/scl_shared/projects": () => ({
      projects: [{ projectId: PROJECT }, { projectId: "prj_other" }],
    }),
    [`/v2/connect/connectors?projectId=${PROJECT}`]: () => ({
      connectors: [
        { id: "scl_ours", name: "our-github" },
        { id: "scl_shared", uid: "oauth/linear" },
      ],
    }),
    [`/v9/projects/${PROJECT}`]: () => ({ name: "my-crew" }),
    ...overrides,
  };
  const call: VercelCall = (path, init) => {
    const respond = responses[path];
    if (init) {
      deleted.push(path);
      return Promise.resolve(respond?.());
    }
    if (!respond) {
      throw new Error(`Unexpected request: ${path}`);
    }
    return Promise.resolve().then(respond);
  };
  return { call, deleted };
}

const denied = () => {
  throw new VercelCallError(403);
};

describe("planRemoval", () => {
  it("removes only what's this project's alone", async () => {
    const plan = await planRemoval(fakeVercel().call, PROJECT);
    expect(plan.removable.map((item) => item.id)).toEqual([
      "scl_ours",
      "store_ours",
    ]);
    expect(plan.kept).toEqual(["shared-blob", "oauth/linear"]);
    expect(plan.projectName).toBe("my-crew");
    expect(plan.limited).toBe(false);
  });

  it("leaves a store with no delete API to the person", async () => {
    const plan = await planRemoval(fakeVercel().call, PROJECT);
    expect(plan.stores).toEqual(["redis"]);
  });

  it("removes connectors before the chat history store", async () => {
    const { removable } = await planRemoval(fakeVercel().call, PROJECT);
    expect(removable.map((item) => item.kind)).toEqual([
      "connector",
      "blob-store",
    ]);
  });

  it("follows connector pages", async () => {
    const first = `/v2/connect/connectors?projectId=${PROJECT}`;
    const { call } = fakeVercel({
      [first]: () => ({
        connectors: [{ id: "scl_ours", name: "our-github" }],
        pagination: { next: "page2" },
      }),
      [`${first}&cursor=page2`]: () => ({
        connectors: [{ id: "scl_shared", name: "linear" }],
      }),
    });
    const plan = await planRemoval(call, PROJECT);
    expect(plan.removable.map((item) => item.id)).toContain("scl_ours");
    expect(plan.kept).toContain("linear");
  });

  it("works within a token that reaches only the project", async () => {
    const { call } = fakeVercel({ "/v1/storage/stores": denied });
    await expect(planRemoval(call, PROJECT)).resolves.toEqual({
      kept: [],
      limited: true,
      projectName: "my-crew",
      removable: [],
      stores: [],
    });
  });

  it("refuses a token that can't reach the project", async () => {
    const { call } = fakeVercel({ [`/v9/projects/${PROJECT}`]: denied });
    await expect(planRemoval(call, PROJECT)).rejects.toThrow(VercelCallError);
  });

  it("doesn't mistake an outage for a limited token", async () => {
    const { call } = fakeVercel({
      "/v1/storage/stores": () => {
        throw new VercelCallError(500);
      },
    });
    await expect(planRemoval(call, PROJECT)).rejects.toThrow(VercelCallError);
  });
});

describe("runRemoval", () => {
  const steps = async (call: VercelCall) => {
    const plan = await planRemoval(call, PROJECT);
    return runRemoval(call, PROJECT, plan, plan.removable);
  };

  it("deletes the project last", async () => {
    const { call, deleted } = fakeVercel();
    await steps(call);
    expect(deleted).toEqual([
      "/v1/connect/connectors/scl_ours",
      "/storage/stores/blob/store_ours",
      `/v9/projects/${PROJECT}`,
    ]);
  });

  it("stops at the first failure, keeping the store and project", async () => {
    const { call, deleted } = fakeVercel({
      "/v1/connect/connectors/scl_ours": () => {
        throw new VercelCallError(500);
      },
    });
    const failing: VercelCall = (path, init) =>
      init && path.includes("connectors")
        ? Promise.reject(new VercelCallError(500))
        : call(path, init);
    const result = await steps(failing);
    expect(result.at(-1)?.ok).toBe(false);
    expect(deleted).toEqual([]);
  });

  it("deletes only the chosen items", async () => {
    const { call, deleted } = fakeVercel();
    const plan = await planRemoval(call, PROJECT);
    await runRemoval(call, PROJECT, plan, []);
    expect(deleted).toEqual([`/v9/projects/${PROJECT}`]);
  });
});

describe("vercelCaller", () => {
  it("sends the token only in its header, and never reports it", async () => {
    const token = "secret-token";
    let url = "";
    const send = ((input: string, init: RequestInit) => {
      url = input;
      expect(new Headers(init.headers).get("authorization")).toBe(
        `Bearer ${token}`
      );
      return Promise.resolve(new Response(null, { status: 403 }));
    }) as typeof fetch;
    const error = await vercelCaller(
      token,
      "team_1",
      send
    )("/x").catch((caught: unknown) => caught);
    expect(url).not.toContain(token);
    expect(url).toContain("teamId=team_1");
    expect(error).toBeInstanceOf(VercelCallError);
    expect(String((error as Error).message)).not.toContain(token);
  });

  it("handles an empty response", async () => {
    const send = (() =>
      Promise.resolve(new Response(null, { status: 204 }))) as typeof fetch;
    await expect(
      vercelCaller("t", "team_1", send)("/x", { method: "DELETE" })
    ).resolves.toBeUndefined();
  });
});
