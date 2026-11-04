import type { defineAgent } from "eve";

type AgentLimits = NonNullable<Parameters<typeof defineAgent>[0]["limits"]>;

/** eve's own cap, used when AI Gateway reports no cost (local models, BYOK). */
const DEFAULT_NEW_INPUT_TOKENS = 40_000_000;
const DEFAULT_BUDGET_USD = 1;

/**
 * Spend per window before a chat stops and asks Continue or Stop. A dollar cap
 * means the same spend whatever model a crew member uses. Read when the
 * session runs, so changing LOPSI_SESSION_BUDGET_USD needs no code change.
 */
function budgetUsd(): number {
  const value = Number(process.env.LOPSI_SESSION_BUDGET_USD);
  return Number.isFinite(value) && value > 0 ? value : DEFAULT_BUDGET_USD;
}

export const limits: AgentLimits = {
  sessionUsage: ({ window }) =>
    window.costUsd === undefined
      ? window.inputTokens - window.cacheReadTokens >= DEFAULT_NEW_INPUT_TOKENS
      : window.costUsd >= budgetUsd(),
};
