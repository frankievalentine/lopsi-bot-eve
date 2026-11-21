import { afterEach, describe, expect, it } from "vitest";
import {
  BUDGET_VARIABLE,
  MAX_BUDGET_USD,
  MIN_BUDGET_USD,
  parseBudgetUsd,
  sessionBudgetUsd,
} from "./session-budget";

describe("parseBudgetUsd", () => {
  it("reads dollars and cents, with or without a dollar sign", () => {
    expect(parseBudgetUsd("2")).toBe(2);
    expect(parseBudgetUsd("2.5")).toBe(2.5);
    expect(parseBudgetUsd(" $2.50 ")).toBe(2.5);
    expect(parseBudgetUsd(".75")).toBe(0.75);
  });

  it("accepts both ends of the range", () => {
    expect(parseBudgetUsd(String(MIN_BUDGET_USD))).toBe(MIN_BUDGET_USD);
    expect(parseBudgetUsd(String(MAX_BUDGET_USD))).toBe(MAX_BUDGET_USD);
  });

  it("refuses amounts outside the range", () => {
    expect(parseBudgetUsd("0.24")).toBeUndefined();
    expect(parseBudgetUsd("0")).toBeUndefined();
    expect(parseBudgetUsd("50.01")).toBeUndefined();
    expect(parseBudgetUsd("5000")).toBeUndefined();
  });

  it("refuses what isn't an amount", () => {
    for (const input of ["", "abc", "-1", "1.234", "1e2", "1,5", "$"]) {
      expect(parseBudgetUsd(input)).toBeUndefined();
    }
  });
});

describe("sessionBudgetUsd", () => {
  const before = process.env[BUDGET_VARIABLE];
  afterEach(() => {
    if (before === undefined) {
      delete process.env[BUDGET_VARIABLE];
    } else {
      process.env[BUDGET_VARIABLE] = before;
    }
  });

  it("is $1 when the variable is unset or not a positive number", () => {
    delete process.env[BUDGET_VARIABLE];
    expect(sessionBudgetUsd()).toBe(1);
    process.env[BUDGET_VARIABLE] = "nope";
    expect(sessionBudgetUsd()).toBe(1);
  });

  it("reads the variable", () => {
    process.env[BUDGET_VARIABLE] = "2.50";
    expect(sessionBudgetUsd()).toBe(2.5);
  });
});
