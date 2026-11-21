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
  "https://vercel.com/new/clone?repository-url=https%3A%2F%2Fgithub.com%2Ffrankievalentine%2Flopsi-bot-eve&project-name=lopsi-bot&repository-name=lopsi-bot&env=LOPSI_ACCESS_PASSWORD%2CVERCEL_TOKEN&envDescription=LOPSI_ACCESS_PASSWORD%3A%20the%20password%20your%20crew%27s%20visitors%20enter%2C%20at%20least%2016%20characters%20%28openssl%20rand%20-base64%2032%29.%20VERCEL_TOKEN%3A%20a%20Vercel%20token%20for%20this%20team%2C%20so%20Lopsi%20can%20see%20the%20services%20you%20add%20in%20Vercel%20Connect.&envLink=https%3A%2F%2Fgithub.com%2Ffrankievalentine%2Flopsi-bot-eve%2Fblob%2Fmain%2Fdocs%2Fgetting-started.md%231-deploy&connect=%5B%7B%22type%22%3A%22github%22%2C%22env%22%3A%22GITHUB_CONNECTOR%22%7D%5D&stores=%5B%7B%22type%22%3A%22blob%22%2C%22access%22%3A%22private%22%7D%5D";
