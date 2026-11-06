import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

export default defineConfig({
  resolve: {
    alias: {
      "@": fileURLToPath(new URL("apps/web", import.meta.url)),
    },
  },
  test: {
    environment: "node",
    include: ["apps/web/**/*.test.ts"],
    restoreMocks: true,
    unstubEnvs: true,
  },
});
