import { defineEvalConfig } from "eve/evals";

/**
 * Run-wide eval configuration for the lopsi agent.
 *
 * @remarks
 * `t.judge(...)` uses eve's default evaluation model, so no judge is named here.
 * Run the cheap loop with `pnpm eval --tag fast`. Evals call real models.
 */
export default defineEvalConfig({});
