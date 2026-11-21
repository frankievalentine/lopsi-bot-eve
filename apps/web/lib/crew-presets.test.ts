import { describe, expect, it } from "vitest";
import { isModelId } from "./agent-model";
import { CREW_PRESETS, MODEL_NOTES } from "./crew-presets";

describe("CREW_PRESETS", () => {
  it("introduces each member with a noun for what it is", () => {
    expect(
      CREW_PRESETS.map((preset) => preset.instructions.split("\n")[2])
    ).toEqual([
      "You are Scout, the crew's researcher. You find, read and summarize so the team can decide quickly.",
      "You are Chief, the crew's chief of staff. You keep the team on track: plans, follow-ups and summaries.",
      "You are Beacon, the crew's service monitor. You watch our services and flag what needs a person.",
      "You are Ledger, the crew's finance lead. You keep our books tidy: invoices, spend and summaries.",
      "You are Tinker, the crew's ops and CI engineer. You keep builds green and deploys moving.",
      "You are Relay, the crew's inbox manager. You answer messages and draft replies so nobody waits.",
    ]);
  });

  it("suggests a model id with a note for its card", () => {
    for (const preset of CREW_PRESETS) {
      expect(isModelId(preset.model)).toBe(true);
      expect(MODEL_NOTES[preset.model]).toBeDefined();
    }
  });
});
