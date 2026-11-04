import type { defineAgent } from "eve";
import {
  DEFAULT_NEW_INPUT_TOKENS,
  sessionBudgetUsd,
} from "../../../apps/web/lib/session-budget.js";

type AgentLimits = NonNullable<Parameters<typeof defineAgent>[0]["limits"]>;

/**
 * Spend per window before a chat stops and asks Continue or Stop. A dollar cap
 * means the same spend whatever model a crew member uses. Read when the
 * session runs, so changing LOPSI_SESSION_BUDGET_USD needs no code change.
 */
export const limits: AgentLimits = {
  sessionUsage: ({ window }) =>
    window.costUsd === undefined
      ? window.inputTokens - window.cacheReadTokens >= DEFAULT_NEW_INPUT_TOKENS
      : window.costUsd >= sessionBudgetUsd(),
};
