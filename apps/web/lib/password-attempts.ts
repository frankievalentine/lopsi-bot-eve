/**
 * Slows password guessing in starter mode, which has no store to share a count
 * in: failures are counted in this server instance's memory, per address. A
 * determined guesser reaching many instances gets further, so the password's
 * 16-character minimum remains the real defense.
 */

const MAX_FAILURES = 10;
const WINDOW_MS = 15 * 60_000;
const MAX_TRACKED = 10_000;

interface Failures {
  count: number;
  readonly resetAt: number;
}

const failures = new Map<string, Failures>();

/** Whether this address has failed too often to try again yet. */
export function isLockedOut(address: string, now = Date.now()): boolean {
  const entry = failures.get(address);
  if (entry === undefined) {
    return false;
  }
  if (entry.resetAt <= now) {
    failures.delete(address);
    return false;
  }
  return entry.count >= MAX_FAILURES;
}

export function recordFailure(address: string, now = Date.now()): void {
  const entry = failures.get(address);
  if (entry !== undefined && entry.resetAt > now) {
    entry.count += 1;
    return;
  }
  if (failures.size >= MAX_TRACKED) {
    for (const [key, value] of failures) {
      if (value.resetAt <= now) {
        failures.delete(key);
      }
    }
    // Still full of live entries: start over rather than grow without bound.
    if (failures.size >= MAX_TRACKED) {
      failures.clear();
    }
  }
  failures.set(address, { count: 1, resetAt: now + WINDOW_MS });
}

export function clearFailures(address: string): void {
  failures.delete(address);
}
