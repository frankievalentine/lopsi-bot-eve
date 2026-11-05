/**
 * Removes a deployed project and what setup made for it, with a Vercel token
 * the person pastes, used for that request and never stored. Vercel decides what
 * the token may delete. Anything another project also uses is kept.
 *
 * @packageDocumentation
 */

const API = "https://api.vercel.com";

/** Something removed along with the project. */
export interface RemovalItem {
  readonly id: string;
  readonly kind: "blob-store" | "connector";
  readonly name: string;
}

export interface RemovalPlan {
  /** Not removed: another project uses them too. */
  readonly kept: readonly string[];
  readonly projectName: string;
  readonly removable: readonly RemovalItem[];
  /** Connected stores with no API to remove them one at a time, like Upstash. */
  readonly stores: readonly string[];
}

export interface RemovalStep {
  readonly error?: string;
  readonly name: string;
  readonly ok: boolean;
}

export type VercelCall = (
  path: string,
  init?: { readonly method: "DELETE" }
) => Promise<unknown>;

/** A request Vercel refused, by status: never the token. */
export class VercelCallError extends Error {
  readonly status: number;

  constructor(status: number) {
    super(`Vercel answered ${status}.`);
    this.status = status;
  }
}

/** Calls the Vercel API as the token's owner, on one team. */
export function vercelCaller(
  token: string,
  teamId: string,
  send: typeof fetch = fetch
): VercelCall {
  return async (path, init) => {
    const separator = path.includes("?") ? "&" : "?";
    const response = await send(
      `${API}${path}${separator}teamId=${encodeURIComponent(teamId)}`,
      {
        headers: { Authorization: `Bearer ${token}` },
        ...(init ? { method: init.method } : {}),
      }
    );
    if (!response.ok) {
      throw new VercelCallError(response.status);
    }
    const text = await response.text();
    return text ? JSON.parse(text) : undefined;
  };
}

interface StoreRow {
  readonly id: string;
  readonly name: string;
  readonly projectsMetadata?: readonly { readonly projectId?: string }[];
  readonly totalConnectedProjects?: number;
  readonly type: string;
}

interface ConnectorRow {
  readonly id: string;
  readonly name?: string;
  readonly uid?: string;
}

interface Page<T> {
  readonly connectors?: readonly T[];
  readonly pagination?: { readonly next?: string | null };
  readonly projects?: readonly T[];
}

async function allPages<T>(
  call: VercelCall,
  path: string,
  key: "connectors" | "projects"
): Promise<readonly T[]> {
  const rows: T[] = [];
  let cursor: string | null | undefined;
  do {
    const separator = path.includes("?") ? "&" : "?";
    // biome-ignore lint/performance/noAwaitInLoops: each page names the next.
    const page = (await call(
      `${path}${cursor ? `${separator}cursor=${encodeURIComponent(cursor)}` : ""}`
    )) as Page<T>;
    rows.push(...(page[key] ?? []));
    cursor = page.pagination?.next;
  } while (cursor);
  return rows;
}

/** What removing this project would remove, keep, and leave to the person. */
export async function planRemoval(
  call: VercelCall,
  projectId: string
): Promise<RemovalPlan> {
  const project = (await call(
    `/v9/projects/${encodeURIComponent(projectId)}`
  )) as { readonly name: string };
  const { stores = [] } = (await call("/v1/storage/stores")) as {
    readonly stores?: readonly StoreRow[];
  };
  const ours = stores.filter((store) =>
    store.projectsMetadata?.some((entry) => entry.projectId === projectId)
  );
  const isShared = (store: StoreRow) =>
    (store.totalConnectedProjects ?? store.projectsMetadata?.length ?? 0) > 1;

  const connectors = await allPages<ConnectorRow>(
    call,
    `/v2/connect/connectors?projectId=${encodeURIComponent(projectId)}`,
    "connectors"
  );
  const withUse = await Promise.all(
    connectors.map(async (connector) => ({
      connector,
      projects: await allPages<unknown>(
        call,
        `/v2/connect/connectors/${encodeURIComponent(connector.id)}/projects`,
        "projects"
      ),
    }))
  );
  const nameOf = ({ id, name, uid }: ConnectorRow) => name ?? uid ?? id;

  return {
    kept: [
      ...ours.filter((store) => isShared(store)).map((store) => store.name),
      ...withUse
        .filter(({ projects }) => projects.length > 1)
        .map(({ connector }) => nameOf(connector)),
    ],
    projectName: project.name,
    removable: [
      // Connectors first: a failure then hasn't cost the chat history.
      ...withUse
        .filter(({ projects }) => projects.length <= 1)
        .map(
          ({ connector }): RemovalItem => ({
            id: connector.id,
            kind: "connector",
            name: nameOf(connector),
          })
        ),
      ...ours
        .filter((store) => store.type === "blob" && !isShared(store))
        .map(
          (store): RemovalItem => ({
            id: store.id,
            kind: "blob-store",
            name: store.name,
          })
        ),
    ],
    stores: ours
      .filter((store) => store.type !== "blob" && !isShared(store))
      .map((store) => store.name),
  };
}

function pathOf(item: RemovalItem): string {
  const id = encodeURIComponent(item.id);
  return item.kind === "blob-store"
    ? `/storage/stores/blob/${id}`
    : `/v1/connect/connectors/${id}`;
}

const messageOf = (error: unknown) =>
  error instanceof Error ? error.message : "That didn't go through.";

/**
 * Removes the chosen items, then the project. The project goes last, and only
 * if the rest went through, so that a failure can be retried from here.
 */
export async function runRemoval(
  call: VercelCall,
  projectId: string,
  plan: RemovalPlan,
  items: readonly RemovalItem[]
): Promise<readonly RemovalStep[]> {
  const steps: RemovalStep[] = [];
  for (const item of items) {
    try {
      // One at a time, to stop at the first failure.
      // biome-ignore lint/performance/noAwaitInLoops: in order, on purpose.
      await call(pathOf(item), { method: "DELETE" });
      steps.push({ name: item.name, ok: true });
    } catch (error) {
      steps.push({ error: messageOf(error), name: item.name, ok: false });
      return steps;
    }
  }
  try {
    await call(`/v9/projects/${encodeURIComponent(projectId)}`, {
      method: "DELETE",
    });
    steps.push({ name: plan.projectName, ok: true });
  } catch (error) {
    steps.push({ error: messageOf(error), name: plan.projectName, ok: false });
  }
  return steps;
}
