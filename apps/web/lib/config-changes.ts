/**
 * Turns a dashboard edit into the files of one pull request: a crew member's
 * crew.json, instructions.md and agent.ts model, or a whole new crew member,
 * always with crew.generated.ts regenerated so `pnpm crew --check` passes.
 *
 * Files are read from and written against one branch snapshot. An edit carries
 * the values it was made from, and is refused when the branch has moved on
 * underneath it, so a change merged meanwhile is never silently overwritten.
 *
 * @packageDocumentation
 */

import {
  type AgentModel,
  readAgentModel,
  usesSessionLimits,
  writeAgentModel,
} from "./agent-model";
import {
  CREW_ID,
  type CrewSchema,
  crewSource,
  parseCrewJson,
  serializeCrewJson,
} from "./crew-core.mjs";
import type { BranchSnapshot } from "./github";

type CrewData = ReturnType<typeof CrewSchema.parse>;

const GENERATED = "apps/web/lib/crew.generated.ts";
/** The crew member new ones are copied from: its channel (access modes) and connections. */
const TEMPLATE_MEMBER = "lopsi";
/**
 * What a new member copies from the template member: its channel (access modes
 * and the chat owner check), connections, hooks (the chat list), and hardening
 * (session budget, sandbox network policy, web_fetch approval).
 */
const TEMPLATE_PATHS = [
  "agent/channels/",
  "agent/connections/",
  "agent/hooks/",
  "agent/tools/",
  "agent/limits.ts",
  "agent/sandbox.ts",
];

const MEMBER_FILE = /^agents\/(?<id>[^/]+)\/agent\//u;

const crewPath = (id: string) => `agents/${id}/crew.json`;
const instructionsPath = (id: string) => `agents/${id}/agent/instructions.md`;
const agentPath = (id: string) => `agents/${id}/agent/agent.ts`;

/** A crew member's editable configuration, as it is on the branch. */
export interface MemberConfig {
  readonly crew: CrewData;
  /** `undefined` when the agent's instructions aren't a single instructions.md. */
  readonly instructions?: string;
  /** `undefined` when agent.ts isn't in eve's generated shape. */
  readonly model?: AgentModel;
}

export class ConfigConflictError extends Error {}

function memberIds(snapshot: BranchSnapshot): string[] {
  const ids = new Set<string>();
  for (const path of snapshot.paths) {
    const match = MEMBER_FILE.exec(path);
    if (match?.groups?.id) {
      ids.add(match.groups.id);
    }
  }
  return [...ids];
}

export async function readMemberConfig(
  snapshot: BranchSnapshot,
  id: string
): Promise<MemberConfig | undefined> {
  if (!memberIds(snapshot).includes(id)) {
    return;
  }
  const crewText = await snapshot.readFile(crewPath(id));
  const parsed = crewText === undefined ? undefined : parseCrewJson(crewText);
  if (parsed !== undefined && !parsed.ok) {
    throw new ConfigConflictError(
      `${crewPath(id)} is invalid on the branch: ${parsed.error}`
    );
  }
  const instructions = await snapshot.readFile(instructionsPath(id));
  const agentSource = await snapshot.readFile(agentPath(id));
  const model =
    agentSource === undefined ? undefined : readAgentModel(agentSource);
  return {
    crew: parsed?.data ?? { mascot: "skipper", name: id },
    ...(instructions === undefined ? {} : { instructions }),
    ...(model === undefined ? {} : { model }),
  };
}

/** crew.generated.ts for the branch, with some members' crew.json replaced. */
async function regeneratedCrew(
  snapshot: BranchSnapshot,
  replaced: Readonly<Record<string, CrewData>>
): Promise<string> {
  const ids = new Set([...memberIds(snapshot), ...Object.keys(replaced)]);
  const entries = await Promise.all(
    [...ids].map(async (id) => {
      if (replaced[id] !== undefined) {
        return { data: replaced[id], id };
      }
      const text = await snapshot.readFile(crewPath(id));
      const parsed = text === undefined ? undefined : parseCrewJson(text);
      return { data: parsed?.ok ? parsed.data : undefined, id };
    })
  );
  return crewSource(entries);
}

const sameJson = (a: unknown, b: unknown) =>
  JSON.stringify(a) === JSON.stringify(b);

/**
 * The files for an edit to one member, or an empty object when nothing changed.
 *
 * @throws {@link ConfigConflictError} When the branch no longer matches `from`.
 */
export async function memberEditFiles(
  snapshot: BranchSnapshot,
  id: string,
  from: MemberConfig,
  to: MemberConfig
): Promise<Record<string, string>> {
  const current = await readMemberConfig(snapshot, id);
  if (current === undefined) {
    throw new ConfigConflictError(
      "This crew member isn't on the branch any more."
    );
  }
  if (
    !sameJson(current.crew, from.crew) ||
    current.instructions !== from.instructions ||
    !sameJson(current.model, from.model)
  ) {
    throw new ConfigConflictError(
      "Someone changed this crew member since you opened it. Reopen it and try again."
    );
  }

  const files: Record<string, string> = {};
  if (!sameJson(to.crew, from.crew)) {
    files[crewPath(id)] = serializeCrewJson(to.crew);
    files[GENERATED] = await regeneratedCrew(snapshot, { [id]: to.crew });
  }
  if (to.instructions !== undefined && to.instructions !== from.instructions) {
    if (from.instructions === undefined) {
      throw new ConfigConflictError(
        "This crew member's instructions aren't a single instructions.md; edit them by hand."
      );
    }
    files[instructionsPath(id)] = to.instructions.endsWith("\n")
      ? to.instructions
      : `${to.instructions}\n`;
  }
  if (to.model !== undefined && !sameJson(to.model, from.model)) {
    if (from.model === undefined) {
      throw new ConfigConflictError(
        "This crew member's agent.ts was edited by hand; change its model there."
      );
    }
    const source = (await snapshot.readFile(agentPath(id))) ?? "";
    files[agentPath(id)] = writeAgentModel(to.model, {
      limits: usesSessionLimits(source),
    });
  }
  return await changedOnly(snapshot, files);
}

/** Drops files whose new content is already on the branch, so a pull request lists only real changes. */
async function changedOnly(
  snapshot: BranchSnapshot,
  files: Record<string, string>
): Promise<Record<string, string>> {
  const entries = await Promise.all(
    Object.entries(files).map(
      async ([path, text]) =>
        [path, text, (await snapshot.readFile(path)) === text] as const
    )
  );
  return Object.fromEntries(
    entries.filter(([, , same]) => !same).map(([path, text]) => [path, text])
  );
}

/** The line a channel that needs its member's id (channels/resend.ts) declares it on. */
const MEMBER_ID_LINE = `const MEMBER_ID = "${TEMPLATE_MEMBER}";`;

/**
 * A template file for the new member: a channel that declares its member's id
 * gets the new one. A channel that should but doesn't is refused, so a copy
 * never answers as the template member.
 */
function withMemberId(path: string, content: string, id: string): string {
  if (content.includes(MEMBER_ID_LINE)) {
    return content.replace(MEMBER_ID_LINE, `const MEMBER_ID = "${id}";`);
  }
  if (path.endsWith("/channels/resend.ts")) {
    throw new ConfigConflictError(
      `${path} no longer declares ${MEMBER_ID_LINE}, so it can't be copied for ${id}.`
    );
  }
  return content;
}

/**
 * The files for a new crew member: its crew.json, instructions and model, the
 * template member's channel and connections, and the regenerated crew list.
 *
 * @throws {@link ConfigConflictError} For a taken or invalid id, or a missing template.
 */
export async function newMemberFiles(
  snapshot: BranchSnapshot,
  id: string,
  config: Required<Pick<MemberConfig, "crew" | "instructions" | "model">>
): Promise<Record<string, string>> {
  if (!CREW_ID.test(id)) {
    throw new ConfigConflictError(
      "Use lowercase letters, digits and hyphens, starting with a letter."
    );
  }
  if (memberIds(snapshot).includes(id)) {
    throw new ConfigConflictError(`agents/${id} already exists.`);
  }
  const templateFiles = [...snapshot.paths].filter((path) =>
    TEMPLATE_PATHS.some((prefix) =>
      path.startsWith(`agents/${TEMPLATE_MEMBER}/${prefix}`)
    )
  );
  if (templateFiles.length === 0) {
    throw new ConfigConflictError(
      `agents/${TEMPLATE_MEMBER} is missing, so there's nothing to copy a channel from.`
    );
  }

  const files: Record<string, string> = {
    [agentPath(id)]: writeAgentModel(config.model, {
      limits: snapshot.paths.has(`agents/${TEMPLATE_MEMBER}/agent/limits.ts`),
    }),
    [crewPath(id)]: serializeCrewJson(config.crew),
    [GENERATED]: await regeneratedCrew(snapshot, { [id]: config.crew }),
    [instructionsPath(id)]: config.instructions.endsWith("\n")
      ? config.instructions
      : `${config.instructions}\n`,
  };
  const copies = await Promise.all(
    templateFiles.map(
      async (path) => [path, await snapshot.readFile(path)] as const
    )
  );
  for (const [path, content] of copies) {
    if (content !== undefined) {
      files[path.replace(`agents/${TEMPLATE_MEMBER}/`, `agents/${id}/`)] =
        withMemberId(path, content, id);
    }
  }
  return files;
}
