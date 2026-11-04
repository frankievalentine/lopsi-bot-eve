import { defineEval } from "eve/evals";

export default defineEval({
  description:
    "A greeting gets a direct answer: the turn succeeds and the agent runs no shell commands.",
  tags: ["fast"],
  async test(t) {
    await t.send("Hi! What are you and what can you do for me?");
    t.succeeded();
    t.notCalledTool("bash");
  },
});
