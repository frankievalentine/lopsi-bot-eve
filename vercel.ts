import { withEve } from "eve/vercel";

export default await withEve({
  routes: [{ destination: { service: "web", type: "service" }, src: "^(.*)$" }],
  services: {
    web: {
      buildCommand: "node ../../node_modules/next/dist/bin/next build",
      framework: "nextjs",
      root: "apps/web",
    },
  },
});
