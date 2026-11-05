/**
 * Demo mode: `NEXT_PUBLIC_LOPSI_DEMO=1`, set when building a public demo. The
 * dashboard opens to everyone with an example crew and scripted replies from
 * the browser (demo-script.ts). No agent or model is called; the agents stay
 * locked behind their own sign-in, which this doesn't touch.
 *
 * @packageDocumentation
 */

export const isDemo = process.env.NEXT_PUBLIC_LOPSI_DEMO === "1";

export const DEPLOY_URL =
  "https://github.com/frankievalentine/lopsi-bot-eve#deploy";
