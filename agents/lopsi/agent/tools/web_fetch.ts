import { defineTool } from "eve/tools";
import { always } from "eve/tools/approval";
import { webFetch } from "eve/tools/web_fetch";

/**
 * eve's web_fetch, asking first. It runs in the app, outside the sandbox's
 * network policy, so a URL built from chat or connector data could carry that
 * data away; the person sees each URL before it's fetched.
 */
export default defineTool({
  ...webFetch,
  approval: {
    prompt: ({ input }) => `Fetch ${input.url}?`,
    request: always(),
  },
});
