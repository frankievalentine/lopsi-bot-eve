import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { DEPLOY_URL } from "./demo";

describe("DEPLOY_URL", () => {
  it("is the README's Deploy button", async () => {
    const readme = await readFile(
      join(import.meta.dirname, "../../../README.md"),
      "utf8"
    );
    expect(readme).toContain(`(${DEPLOY_URL})`);
  });
});
