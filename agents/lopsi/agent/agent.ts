import { defineAgent } from "eve";

export default defineAgent({
  model: "meituan/longcat-2.5",
  modelOptions: {
    providerOptions: {
      gateway: {
        models: ["alibaba/qwen3.7-flash"],
      },
    },
  },
  reasoning: "high",
});
