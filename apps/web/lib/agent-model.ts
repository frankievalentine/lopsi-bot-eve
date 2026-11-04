/**
 * Reads and changes the model in an agent's agent.ts, but only while the file
 * still has the shape eve generates. agent.ts is code; once someone edits it by
 * hand, the dashboard shows the model as read-only instead of rewriting it.
 *
 * @packageDocumentation
 */

/** eve's generated agent.ts: an import, then defineAgent with a model and optional reasoning. */
const GENERATED_SHAPE =
  /^import \{ defineAgent \} from "eve";\n\nexport default defineAgent\(\{\n {2}model: "(?<model>[a-z0-9][\w.-]*\/[\w.:-]+)",\n(?: {2}reasoning: "(?<reasoning>[a-z-]+)",\n)?\}\);\n$/u;

/** An AI Gateway model id: `provider/model`. */
const MODEL_ID = /^[a-z0-9][\w.-]*\/[\w.:-]+$/u;

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
  readonly model: string;
  readonly reasoning?: ReasoningLevel;
}

/** The model an agent.ts sets, or `undefined` when the file isn't in the generated shape. */
export function readAgentModel(source: string): AgentModel | undefined {
  const groups = GENERATED_SHAPE.exec(source)?.groups;
  if (groups?.model === undefined) {
    return;
  }
  const { reasoning } = groups;
  if (
    reasoning !== undefined &&
    !(REASONING_LEVELS as readonly string[]).includes(reasoning)
  ) {
    return;
  }
  return {
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

/** agent.ts in eve's generated shape, with this model and reasoning. */
export function writeAgentModel({ model, reasoning }: AgentModel): string {
  if (!isModelId(model)) {
    throw new Error(`"${model}" isn't a provider/model id.`);
  }
  const reasoningLine =
    reasoning === undefined ? "" : `  reasoning: "${reasoning}",\n`;
  return `import { defineAgent } from "eve";\n\nexport default defineAgent({\n  model: "${model}",\n${reasoningLine}});\n`;
}
