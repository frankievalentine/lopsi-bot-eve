#!/usr/bin/env node
/**
 * Generates apps/web/lib/crew.generated.ts from every agents/<name>/crew.json,
 * so adding a crew member is adding its directory. The output is committed;
 * `pnpm crew --check` (part of `pnpm validate`) fails when it is out of date.
 * The rules live in apps/web/lib/crew-core.mjs, which the dashboard shares.
 *
 * An agent without crew.json still appears, named after its directory.
 *
 * Usage: pnpm crew [--check]
 */

import { existsSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { crewSource, parseCrewJson } from "../apps/web/lib/crew-core.mjs";

const AGENTS_DIR = "agents";
const OUTPUT = "apps/web/lib/crew.generated.ts";

const entries = readdirSync(AGENTS_DIR, { withFileTypes: true })
  .filter(
    (entry) =>
      entry.isDirectory() && existsSync(join(AGENTS_DIR, entry.name, "agent"))
  )
  .map(({ name: id }) => {
    const file = join(AGENTS_DIR, id, "crew.json");
    if (!existsSync(file)) {
      return { data: undefined, id };
    }
    const parsed = parseCrewJson(readFileSync(file, "utf8"));
    if (!parsed.ok) {
      console.error(`\n  ${file} is invalid:\n${parsed.error}\n`);
      process.exit(1);
    }
    return { data: parsed.data, id };
  });
const source = crewSource(entries);

if (process.argv.includes("--check")) {
  const current = existsSync(OUTPUT) ? readFileSync(OUTPUT, "utf8") : "";
  if (current !== source) {
    console.error(`\n  ${OUTPUT} is out of date. Run \`pnpm crew\`.\n`);
    process.exit(1);
  }
} else {
  writeFileSync(OUTPUT, source);
  console.log(
    `  Wrote ${OUTPUT} (${entries.length} crew member${entries.length === 1 ? "" : "s"})`
  );
}
