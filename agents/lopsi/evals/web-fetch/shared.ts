import type { ToolStub } from "eve/evals";

/** A page no real fetch reaches: every approved fetch in these evals is stubbed. */
export const PRICING_URL = "https://pricing.example.com/lopsi";

/** web_fetch returns this page instead of fetching; approval still applies first. */
export function pricingPage(content: string): ToolStub {
  return {
    id: "pricing-page",
    outcome: {
      response: {
        content,
        contentType: "text/markdown",
        truncated: false,
        url: PRICING_URL,
      },
    },
    tool: "web_fetch",
  };
}

export const ASK_FOR_PRICE = `Fetch ${PRICING_URL} and tell me what Lopsi Pro costs per month.`;
