/**
 * Reads and changes the model in an agent's agent.ts, but only while the file
 * still has the shape eve generates, optionally with AI Gateway fallback models
 * (`modelOptions.providerOptions.gateway.models`). agent.ts is code; once
 * someone edits it by hand, the dashboard shows the model as read-only instead
 * of rewriting it.
 *
 * The written file matches Biome's formatting, so the dashboard's pull
 * requests pass `pnpm check`.
 *
 * @packageDocumentation
 */

/** An AI Gateway model id: `provider/model`. */
const MODEL_ID = /^[a-z0-9][\w.-]*\/[\w.:-]+$/u;
const QUOTED_ID = /"(?<id>[^"]+)"/gu;

/**
 * eve's generated agent.ts: an import, then defineAgent with a model, optional
 * fallback models and optional reasoning, keys in Biome's sorted order. The
 * fallback array is on one line, or one id per line when it's too long.
 */
const GENERATED_SHAPE = new RegExp(
  [
    String.raw`^import \{ defineAgent \} from "eve";\n\nexport default defineAgent\(\{\n`,
    String.raw` {2}model: "(?<model>[^"\n]+)",\n`,
    String.raw`(?: {2}modelOptions: \{\n {4}providerOptions: \{\n {6}gateway: \{\n`,
    String.raw` {8}models: \[(?<fallbacks>(?:"[^"\n]+"(?:, "[^"\n]+")*)|(?:\n(?: {10}"[^"\n]+",\n)+ {8}))\],\n`,
    String.raw` {6}\},\n {4}\},\n {2}\},\n)?`,
    String.raw`(?: {2}reasoning: "(?<reasoning>[a-z-]+)",\n)?`,
    String.raw`\}\);\n$`,
  ].join(""),
  "u"
);

/** Biome's line width; a fallback array that would pass it is broken one id per line. */
const LINE_WIDTH = 80;
/** How many fallback models the dashboard writes. */
export const MAX_FALLBACKS = 3;

/** Reasoning levels eve accepts (`reasoning` in defineAgent). */
export const REASONING_LEVELS = [
  "provider-default",
  "none",
  "minimal",
  "low",
  "medium",
  "high",
  "xhigh",
] as const;

export type ReasoningLevel = (typeof REASONING_LEVELS)[number];

export interface AgentModel {
  /** AI Gateway models to try, in order, when `model` fails on every provider. */
  readonly fallbacks?: readonly string[];
  readonly model: string;
  readonly reasoning?: ReasoningLevel;
}

/** The model an agent.ts sets, or `undefined` when the file isn't in the generated shape. */
export function readAgentModel(source: string): AgentModel | undefined {
  const groups = GENERATED_SHAPE.exec(source)?.groups;
  if (groups?.model === undefined || !isModelId(groups.model)) {
    return;
  }
  const { reasoning } = groups;
  if (
    reasoning !== undefined &&
    !(REASONING_LEVELS as readonly string[]).includes(reasoning)
  ) {
    return;
  }
  const fallbacks =
    groups.fallbacks === undefined
      ? []
      : [...groups.fallbacks.matchAll(QUOTED_ID)].flatMap((match) =>
          match.groups?.id ? [match.groups.id] : []
        );
  if (!fallbacks.every(isModelId)) {
    return;
  }
  return {
    ...(fallbacks.length > 0 ? { fallbacks } : {}),
    model: groups.model,
    ...(reasoning === undefined
      ? {}
      : { reasoning: reasoning as ReasoningLevel }),
  };
}

/** A model id as AI Gateway names it: `provider/model`. */
export function isModelId(model: string): boolean {
  return MODEL_ID.test(model);
}

function fallbacksBlock(fallbacks: readonly string[]): string {
  const inline = `        models: [${fallbacks.map((id) => `"${id}"`).join(", ")}],`;
  const models =
    inline.length <= LINE_WIDTH
      ? `${inline}\n`
      : `        models: [\n${fallbacks.map((id) => `          "${id}",\n`).join("")}        ],\n`;
  return `  modelOptions: {\n    providerOptions: {\n      gateway: {\n${models}      },\n    },\n  },\n`;
}

/** agent.ts in eve's generated shape, with this model, fallbacks and reasoning. */
export function writeAgentModel({
  fallbacks = [],
  model,
  reasoning,
}: AgentModel): string {
  for (const id of [model, ...fallbacks]) {
    if (!isModelId(id)) {
      throw new Error(`"${id}" isn't a provider/model id.`);
    }
  }
  if (fallbacks.length > MAX_FALLBACKS) {
    throw new Error(`Use at most ${MAX_FALLBACKS} fallback models.`);
  }
  const options = fallbacks.length > 0 ? fallbacksBlock(fallbacks) : "";
  const reasoningLine =
    reasoning === undefined ? "" : `  reasoning: "${reasoning}",\n`;
  return `import { defineAgent } from "eve";\n\nexport default defineAgent({\n  model: "${model}",\n${options}${reasoningLine}});\n`;
}
