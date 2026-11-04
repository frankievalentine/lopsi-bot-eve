import { defineAgent } from "eve";
import { limits } from "./limits";

export default defineAgent({
  limits,
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
