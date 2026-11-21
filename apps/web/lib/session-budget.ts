/** eve's own cap, used when AI Gateway reports no cost (local models, BYOK). */
export const DEFAULT_NEW_INPUT_TOKENS = 40_000_000;
const DEFAULT_BUDGET_USD = 1;

/** The variable the budget is kept in; Settings writes it and redeploys. */
export const BUDGET_VARIABLE = "LOPSI_SESSION_BUDGET_USD";

/** The range Settings accepts: low enough to catch a runaway chat, high enough that a typo can't remove the cap. */
export const MIN_BUDGET_USD = 0.25;
export const MAX_BUDGET_USD = 50;

const AMOUNT = /^\$?\s*(?<dollars>\d+(?:\.\d{1,2})?|\.\d{1,2})$/u;

/**
 * Spend per chat window before it stops and asks Continue or Stop:
 * LOPSI_SESSION_BUDGET_USD, or $1. The agent's limits.ts and the settings page
 * both read it here.
 */
export function sessionBudgetUsd(): number {
  const value = Number(process.env[BUDGET_VARIABLE]);
  return Number.isFinite(value) && value > 0 ? value : DEFAULT_BUDGET_USD;
}

/**
 * A budget typed in Settings, in dollars and cents (`2`, `2.5`, `$2.50`), or
 * undefined when it isn't one or is outside the range Settings accepts.
 */
export function parseBudgetUsd(input: string): number | undefined {
  const match = AMOUNT.exec(input.trim());
  const dollars = match?.groups?.dollars;
  if (dollars === undefined) {
    return;
  }
  const value = Math.round(Number(dollars) * 100) / 100;
  return value >= MIN_BUDGET_USD && value <= MAX_BUDGET_USD ? value : undefined;
}
