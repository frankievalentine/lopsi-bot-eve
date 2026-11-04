/** eve's own cap, used when AI Gateway reports no cost (local models, BYOK). */
export const DEFAULT_NEW_INPUT_TOKENS = 40_000_000;
const DEFAULT_BUDGET_USD = 1;

/**
 * Spend per chat window before it stops and asks Continue or Stop:
 * LOPSI_SESSION_BUDGET_USD, or $1. The agent's limits.ts and the settings page
 * both read it here.
 */
export function sessionBudgetUsd(): number {
  const value = Number(process.env.LOPSI_SESSION_BUDGET_USD);
  return Number.isFinite(value) && value > 0 ? value : DEFAULT_BUDGET_USD;
}
