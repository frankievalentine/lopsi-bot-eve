/**
 * The Edit crew member form's model, apart from its components so it can be
 * tested: a member's config as form fields and back, and the changes between
 * two forms, each with the file it's written to and how to undo it.
 *
 * @packageDocumentation
 */

import type { MascotKind } from "@/components/mascot";
import type { ReasoningLevel } from "./agent-model";
import { APPROVAL_LABELS, type ApprovalMode } from "./approval-labels";
import type { MemberConfig } from "./config-changes";
import { CREW_PRESETS } from "./crew-presets";
import type { ToolSwitch, WebFetchMode } from "./member-access";

/** A connector the member can be limited to. */
export interface ConnectorChoice {
  readonly configured: boolean;
  readonly id: string;
  readonly name: string;
}

/** `all`, or the connector ids the member is limited to (crew.json `connectors`). */
export type Connectors = "all" | readonly string[];

export interface Tools {
  readonly bash?: ToolSwitch;
  readonly webFetch?: WebFetchMode;
  readonly webSearch?: ToolSwitch;
}

export const REASONING: readonly {
  readonly label: string;
  readonly value: ReasoningLevel | "";
}[] = [
  { label: "Default", value: "" },
  { label: "Low", value: "low" },
  { label: "Medium", value: "medium" },
  { label: "High", value: "high" },
];

/** A reasoning level's name, including ones only agent.ts can set. */
export function reasoningLabel(value: ReasoningLevel | ""): string {
  return REASONING.find((option) => option.value === value)?.label ?? value;
}

export const WEB_FETCH: Record<WebFetchMode, string> = {
  always: "Ask every page",
  never: "Never asks (set in the file)",
  off: "Off",
  once: "Ask once per chat",
};

export const SECTIONS = [
  { id: "profile", label: "Name and look" },
  { id: "model", label: "Model" },
  { id: "instructions", label: "Instructions" },
  { id: "starters", label: "Starter prompts" },
  { id: "access", label: "Services and tools" },
  { id: "approvals", label: "Approvals" },
  { id: "advanced", label: "Advanced" },
] as const;

export type SectionId = (typeof SECTIONS)[number]["id"];

export const MAX_PROMPTS = 4;

/** A look's name: the crew role that has it. */
export const LOOK_NAMES = new Map<MascotKind, string>(
  CREW_PRESETS.map((preset) => [preset.mascot, preset.name])
);

export interface EditForm {
  readonly approvals: ApprovalMode;
  readonly connectors: Connectors;
  /** Sandbox domains, one per line; `undefined` when sandbox.ts was edited by hand. */
  readonly domains?: string;
  readonly fallbacks: readonly string[];
  /** `undefined` when the instructions aren't a single instructions.md. */
  readonly instructions?: string;
  readonly mascot: MascotKind;
  /** `undefined` when agent.ts was edited by hand. */
  readonly model?: string;
  readonly name: string;
  readonly order: string;
  readonly prompts: readonly string[];
  readonly reasoning: ReasoningLevel | "";
  readonly role: string;
  readonly tools: Tools;
}

export type Update = (change: Partial<EditForm>) => void;

export function formOf(config: MemberConfig): EditForm {
  const { access = {}, crew, model } = config;
  return {
    approvals: crew.approvals ?? "always",
    connectors: crew.connectors ?? "all",
    ...(access.sandboxDomains === undefined
      ? {}
      : { domains: access.sandboxDomains.join("\n") }),
    fallbacks: model?.fallbacks ?? [],
    ...(config.instructions === undefined
      ? {}
      : { instructions: config.instructions }),
    mascot: crew.mascot,
    ...(model === undefined ? {} : { model: model.model }),
    name: crew.name,
    order: crew.order === undefined ? "" : String(crew.order),
    prompts: crew.suggestions ?? [],
    reasoning: model?.reasoning ?? "",
    role: crew.role ?? "",
    tools: {
      ...(access.bash === undefined ? {} : { bash: access.bash }),
      ...(access.webFetch === undefined ? {} : { webFetch: access.webFetch }),
      ...(access.webSearch === undefined
        ? {}
        : { webSearch: access.webSearch }),
    },
  };
}

export function linesOf(text: string): string[] {
  return text
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean);
}

/** The edited config; what the dialog can't change (hand-edited files) is left out, so it stays as it is. */
export function configOf(form: EditForm): MemberConfig {
  const suggestions = form.prompts.map((p) => p.trim()).filter(Boolean);
  const order = form.order.trim() === "" ? undefined : Number(form.order);
  const fallbacks = form.fallbacks.filter((id) => id !== form.model?.trim());
  return {
    access: {
      ...form.tools,
      ...(form.domains === undefined
        ? {}
        : { sandboxDomains: linesOf(form.domains) }),
    },
    crew: {
      // "always" is the default, left out of crew.json.
      ...(form.approvals === "always" ? {} : { approvals: form.approvals }),
      ...(form.connectors === "all"
        ? {}
        : { connectors: [...form.connectors] }),
      mascot: form.mascot,
      name: form.name.trim(),
      ...(form.role.trim() ? { role: form.role.trim() } : {}),
      ...(order === undefined ? {} : { order }),
      ...(suggestions.length > 0 ? { suggestions } : {}),
    },
    ...(form.instructions === undefined
      ? {}
      : { instructions: form.instructions }),
    ...(form.model?.trim()
      ? {
          model: {
            ...(fallbacks.length > 0 ? { fallbacks } : {}),
            model: form.model.trim(),
            ...(form.reasoning ? { reasoning: form.reasoning } : {}),
          },
        }
      : {}),
  };
}

/** One row of the review: what changed, from what to what, and how to put it back. */
export interface Change {
  readonly after: string;
  readonly before?: string;
  /** Where it's written, under agents/<id>/ (crew.json also regenerates the crew list). */
  readonly file: string;
  readonly label: string;
  readonly section: SectionId;
  readonly undo: Partial<EditForm>;
}

export function servicesLabel(
  connectors: Connectors,
  choices: readonly ConnectorChoice[]
): string {
  if (connectors === "all") {
    return "All connectors";
  }
  const names = new Map(choices.map((choice) => [choice.id, choice.name]));
  return connectors.map((id) => names.get(id) ?? id).join(", ") || "None";
}

const onOff = (value: string | undefined) => (value === "on" ? "On" : "Off");

interface Names {
  readonly choices: readonly ConnectorChoice[];
  readonly models: ReadonlyMap<string, string>;
}

type Check = (from: EditForm, to: EditForm, names: Names) => Change | null;

const CREW_FILE = "crew.json";
const AGENT_FILE = "agent/agent.ts";

/** `change`, unless the setting is the same as it was. */
function unless(same: boolean, change: Change): Change | null {
  return same ? null : change;
}

const orNone = (value: string) => value.trim() || "None";
const listed = (list: readonly string[]) => list.join(", ") || "None";
const orderOf = (value: string) => value.trim() || "After the others";
const domainsOf = (value = "") => linesOf(value).join(", ") || "No network";
const lookOf = (mascot: MascotKind) => LOOK_NAMES.get(mascot) ?? mascot;

/** The settings before the starter prompts, in the form's order. */
const PROFILE_CHECKS: readonly Check[] = [
  (from, to) =>
    unless(from.name.trim() === to.name.trim(), {
      after: orNone(to.name),
      before: from.name,
      file: CREW_FILE,
      label: "Name",
      section: "profile",
      undo: { name: from.name },
    }),
  (from, to) =>
    unless(from.role.trim() === to.role.trim(), {
      after: orNone(to.role),
      before: orNone(from.role),
      file: CREW_FILE,
      label: "Role",
      section: "profile",
      undo: { role: from.role },
    }),
  (from, to) =>
    unless(from.mascot === to.mascot, {
      after: lookOf(to.mascot),
      before: lookOf(from.mascot),
      file: CREW_FILE,
      label: "Look",
      section: "profile",
      undo: { mascot: from.mascot },
    }),
  (from, to, names) =>
    unless(to.model === undefined || from.model === to.model, {
      after: names.models.get(to.model ?? "") ?? to.model ?? "",
      before: names.models.get(from.model ?? "") ?? from.model ?? "",
      file: AGENT_FILE,
      label: "Model",
      section: "model",
      undo: { model: from.model },
    }),
  (from, to) =>
    unless(from.reasoning === to.reasoning, {
      after: reasoningLabel(to.reasoning),
      before: reasoningLabel(from.reasoning),
      file: AGENT_FILE,
      label: "Reasoning",
      section: "model",
      undo: { reasoning: from.reasoning },
    }),
  (from, to) =>
    unless(
      to.instructions === undefined || from.instructions === to.instructions,
      {
        after: `Edited, ${(to.instructions ?? "").trim().split("\n").length} lines`,
        file: "agent/instructions.md",
        label: "Instructions",
        section: "instructions",
        undo: { instructions: from.instructions },
      }
    ),
];

/** The settings after the starter prompts. */
const ACCESS_CHECKS: readonly Check[] = [
  (from, to, names) =>
    unless(JSON.stringify(from.connectors) === JSON.stringify(to.connectors), {
      after: servicesLabel(to.connectors, names.choices),
      before: servicesLabel(from.connectors, names.choices),
      file: CREW_FILE,
      label: "Services",
      section: "access",
      undo: { connectors: from.connectors },
    }),
  (from, to) =>
    unless(from.tools.bash === to.tools.bash, {
      after: onOff(to.tools.bash),
      before: onOff(from.tools.bash),
      file: "agent/tools/bash.ts",
      label: "Shell",
      section: "access",
      undo: { tools: { ...to.tools, bash: from.tools.bash } },
    }),
  (from, to) =>
    unless(from.tools.webSearch === to.tools.webSearch, {
      after: onOff(to.tools.webSearch),
      before: onOff(from.tools.webSearch),
      file: "agent/tools/web_search.ts",
      label: "Web search",
      section: "access",
      undo: { tools: { ...to.tools, webSearch: from.tools.webSearch } },
    }),
  (from, to) =>
    unless(from.tools.webFetch === to.tools.webFetch, {
      after: to.tools.webFetch ? WEB_FETCH[to.tools.webFetch] : "",
      before: from.tools.webFetch ? WEB_FETCH[from.tools.webFetch] : "",
      file: "agent/tools/web_fetch.ts",
      label: "Web pages",
      section: "access",
      undo: { tools: { ...to.tools, webFetch: from.tools.webFetch } },
    }),
  (from, to) =>
    unless(from.approvals === to.approvals, {
      after: APPROVAL_LABELS[to.approvals].label,
      before: APPROVAL_LABELS[from.approvals].label,
      file: CREW_FILE,
      label: "Changes in services",
      section: "approvals",
      undo: { approvals: from.approvals },
    }),
  (from, to) =>
    unless(listed(from.fallbacks) === listed(to.fallbacks), {
      after: listed(to.fallbacks),
      before: listed(from.fallbacks),
      file: AGENT_FILE,
      label: "Fallback models",
      section: "advanced",
      undo: { fallbacks: from.fallbacks },
    }),
  (from, to) =>
    unless(from.order.trim() === to.order.trim(), {
      after: orderOf(to.order),
      before: orderOf(from.order),
      file: CREW_FILE,
      label: "Order",
      section: "advanced",
      undo: { order: from.order },
    }),
  (from, to) =>
    unless(
      to.domains === undefined ||
        domainsOf(from.domains) === domainsOf(to.domains),
      {
        after: domainsOf(to.domains),
        before: domainsOf(from.domains),
        file: "agent/sandbox.ts",
        label: "Sandbox network",
        section: "advanced",
        undo: { domains: from.domains },
      }
    ),
];

/** Each starter prompt added or removed; one edited is both. */
function promptChanges(from: EditForm, to: EditForm): Change[] {
  const before = new Set(from.prompts.map((p) => p.trim()));
  const after = new Set(to.prompts.map((p) => p.trim()).filter(Boolean));
  const added = [...after].filter((prompt) => !before.has(prompt));
  const removed = [...before].filter((prompt) => !after.has(prompt));
  return [
    ...added.map((prompt) => ({
      after: `Added "${prompt}"`,
      file: CREW_FILE,
      label: "Starter prompt",
      section: "starters" as const,
      undo: { prompts: to.prompts.filter((p) => p.trim() !== prompt) },
    })),
    ...removed.map((prompt) => ({
      after: `Removed "${prompt}"`,
      file: CREW_FILE,
      label: "Starter prompt",
      section: "starters" as const,
      undo: { prompts: [...to.prompts, prompt] },
    })),
  ];
}

/** Each setting that differs from what was loaded, in the form's order. */
export function changesOf(
  from: EditForm,
  to: EditForm,
  names: Names
): Change[] {
  const run = (checks: readonly Check[]) =>
    checks
      .map((check) => check(from, to, names))
      .filter((change): change is Change => change !== null);
  return [
    ...run(PROFILE_CHECKS),
    ...promptChanges(from, to),
    ...run(ACCESS_CHECKS),
  ];
}

/** The pull request's files for these changes; crew.json also regenerates the crew list. */
export function filesOf(id: string, changes: readonly Change[]): string[] {
  const files = [...new Set(changes.map((c) => `agents/${id}/${c.file}`))];
  return files.some((file) => file.endsWith("/crew.json"))
    ? [...files, "apps/web/lib/crew.generated.ts"]
    : files;
}
