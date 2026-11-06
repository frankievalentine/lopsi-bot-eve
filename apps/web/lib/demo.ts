/**
 * Demo mode: `NEXT_PUBLIC_LOPSI_DEMO=1`, set when building a public demo. The
 * dashboard opens to everyone with an example crew and scripted replies from
 * the browser (demo-script.ts). No agent or model is called; the agents stay
 * locked behind their own sign-in, which this doesn't touch.
 *
 * @packageDocumentation
 */

export const isDemo = process.env.NEXT_PUBLIC_LOPSI_DEMO === "1";

/** The README's Deploy button; a test keeps the two the same. */
export const DEPLOY_URL =
  "https://vercel.com/new/clone?repository-url=https%3A%2F%2Fgithub.com%2Ffrankievalentine%2Flopsi-bot-eve&project-name=lopsi-bot&repository-name=lopsi-bot&env=LOPSI_ACCESS_PASSWORD&envDescription=The%20password%20your%20crew%27s%20visitors%20enter.%20At%20least%2016%20characters%3B%20generate%20one%20with%3A%20openssl%20rand%20-base64%2032&envLink=https%3A%2F%2Fgithub.com%2Ffrankievalentine%2Flopsi-bot-eve%2Fblob%2Fmain%2Fdocs%2Faccess.md%23starter-mode&connect=%5B%7B%22type%22%3A%22github%22%2C%22env%22%3A%22GITHUB_CONNECTOR%22%7D%5D";
