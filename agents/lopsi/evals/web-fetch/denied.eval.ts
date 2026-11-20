import { defineEval } from "eve/evals";
import { equals } from "eve/evals/expect";
import { calls } from "eve/events";
import { ASK_FOR_PRICE } from "./shared";

const NAMES_THE_URL = /pricing\.example\.com/u;

export default defineEval({
  description:
    "web_fetch waits for the person's approval, naming the URL, and a denied fetch never runs.",
  tags: ["fast"],
  async test(t) {
    const asked = await t.send(ASK_FOR_PRICE);
    asked.session.requireInteraction({
      prompt: NAMES_THE_URL,
      toolName: "web_fetch",
    });

    const denied = await asked.session.respondAll("deny");
    denied.expectOk();
    t.calledTool("web_fetch", { count: 1, status: "rejected" });
    t.check(
      calls(denied.view, { name: "web_fetch" }).filter(
        (call) => call.state === "completed"
      ).length,
      equals(0)
    );
  },
});
