import { describe, expect, it } from "vitest";
import { clearFailures, isLockedOut, recordFailure } from "./password-attempts";

const fail = (address: string, times: number, now: number) => {
  for (let count = 0; count < times; count += 1) {
    recordFailure(address, now);
  }
};

describe("password attempts", () => {
  it("locks an address out after 10 failures", () => {
    fail("a", 9, 0);
    expect(isLockedOut("a", 0)).toBe(false);
    fail("a", 1, 0);
    expect(isLockedOut("a", 0)).toBe(true);
  });

  it("doesn't lock out other addresses", () => {
    fail("b", 10, 0);
    expect(isLockedOut("c", 0)).toBe(false);
  });

  it("lets an address try again after 15 minutes", () => {
    fail("d", 10, 0);
    expect(isLockedOut("d", 15 * 60_000 - 1)).toBe(true);
    expect(isLockedOut("d", 15 * 60_000)).toBe(false);
  });

  it("forgets failures on success", () => {
    fail("e", 9, 0);
    clearFailures("e");
    fail("e", 9, 0);
    expect(isLockedOut("e", 0)).toBe(false);
  });
});
