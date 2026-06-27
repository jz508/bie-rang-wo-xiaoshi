import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
  },
  resolve: {
    alias: {
      "@bie-rang-wo-xiaoshi/domain": new URL("../../packages/domain/src/index.ts", import.meta.url)
        .pathname,
    },
  },
});
