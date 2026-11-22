import { describe, expect, it } from "vitest";
import type { MemberConfig } from "./config-changes";
import {
  changesOf,
  configOf,
  type EditForm,
  filesOf,
  formOf,
} from "./member-edit";

const NAMES = {
  choices: [
    { configured: true, id: "github", name: "GitHub" },
    { configured: true, id: "linear", name: "Linear" },
  ],
  models: new Map([
    ["google/gemini-3.8-flash", "Gemini 3.8 Flash"],
    ["anthropic/claude-sonnet-5.5", "Claude Sonnet 5.5"],
  ]),
};

const SCOUT: MemberConfig = {
  access: {
    bash: "on",
    sandboxDomains: ["registry.npmjs.org"],
    webFetch: "always",
    webSearch: "on",
  },
  crew: {
    approvals: "once",
    connectors: ["github"],
    mascot: "navigator",
    name: "Scout",
    order: 2,
    role: "Research",
    suggestions: ["Compare recent writing on a topic"],
  },
  instructions: "# Identity\n\nYou are Scout.\n",
  model: {
    fallbacks: ["openai/gpt-6-luna"],
    model: "google/gemini-3.8-flash",
    reasoning: "medium",
  },
};

const edit = (form: EditForm, change: Partial<EditForm>) =>
  changesOf(form, { ...form, ...change }, NAMES);

describe("formOf and configOf", () => {
  it("give back the same config when nothing is edited", () => {
    const form = formOf(SCOUT);
    expect(configOf(form)).toEqual(SCOUT);
    expect(changesOf(form, form, NAMES)).toEqual([]);
  });

  it("leave out what was edited by hand, so it stays as it is", () => {
    const config: MemberConfig = {
      access: { webSearch: "on" },
      crew: { mascot: "lookout", name: "Beacon" },
    };
    const form = formOf(config);
    expect(form.model).toBeUndefined();
    expect(form.instructions).toBeUndefined();
    expect(form.domains).toBeUndefined();
    expect(configOf(form)).toEqual(config);
  });

  it("leaves defaults out of crew.json", () => {
    const form = formOf(SCOUT);
    const { crew } = configOf({
      ...form,
      approvals: "always",
      connectors: "all",
      order: "",
      prompts: [" ", ""],
      role: "  ",
    });
    expect(crew).toEqual({ mascot: "navigator", name: "Scout" });
  });
});

describe("changesOf", () => {
  const form = formOf(SCOUT);

  it("names a model change by its model names, in agent.ts", () => {
    expect(edit(form, { model: "anthropic/claude-sonnet-5.5" })).toEqual([
      expect.objectContaining({
        after: "Claude Sonnet 5.5",
        before: "Gemini 3.8 Flash",
        file: "agent/agent.ts",
        section: "model",
      }),
    ]);
  });

  it("undoes a change back to no changes", () => {
    const edited = {
      ...form,
      approvals: "never" as const,
      mascot: "purser" as const,
    };
    const changes = changesOf(form, edited, NAMES);
    expect(changes.map((c) => c.label)).toEqual([
      "Look",
      "Changes in services",
    ]);
    const undone = Object.assign(
      {},
      edited,
      ...changes.map((change) => change.undo)
    ) as EditForm;
    expect(changesOf(form, undone, NAMES)).toEqual([]);
  });

  it("lists starter prompts added and removed; blank ones don't count", () => {
    const changes = edit(form, {
      prompts: ["What should I read before tomorrow?", "  "],
    });
    expect(changes.map((c) => c.after)).toEqual([
      'Added "What should I read before tomorrow?"',
      'Removed "Compare recent writing on a topic"',
    ]);
  });

  it("names connectors and tools", () => {
    const changes = edit(form, {
      connectors: "all",
      tools: { ...form.tools, bash: "off" },
    });
    expect(changes.map((c) => [c.label, c.before, c.after])).toEqual([
      ["Services", "GitHub", "All connectors"],
      ["Shell", "On", "Off"],
    ]);
  });

  it("ignores whitespace in names and domains", () => {
    expect(
      edit(form, { domains: " registry.npmjs.org \n\n", name: "Scout " })
    ).toEqual([]);
  });
});

describe("filesOf", () => {
  it("adds the crew list when crew.json changes", () => {
    const form = formOf(SCOUT);
    const changes = edit(form, {
      approvals: "always",
      reasoning: "high",
      tools: { ...form.tools, webSearch: "off" },
    });
    expect(filesOf("scout", changes)).toEqual([
      "agents/scout/agent/agent.ts",
      "agents/scout/agent/tools/web_search.ts",
      "agents/scout/crew.json",
      "apps/web/lib/crew.generated.ts",
    ]);
  });
});
