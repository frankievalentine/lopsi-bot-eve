import { defineEval } from "eve/evals";
import { ASK_FOR_PRICE, pricingPage } from "./shared";

export default defineEval({
  description:
    "An approved fetch runs once and the reply uses the page (stubbed, no network).",
  tags: ["fast"],
  async test(t) {
    const session = await t.session({
      stubs: [pricingPage("# Lopsi pricing\n\nLopsi Pro: $42 per month.")],
    });
    const asked = await session.send(ASK_FOR_PRICE);
    asked.session.requireInteraction({ toolName: "web_fetch" });

    const answered = await asked.session.respondAll("approve");
    t.succeeded();
    t.calledTool("web_fetch", { count: 1 });
    answered.messageIncludes("42");
  },
});
