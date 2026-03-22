import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    globals: true,
    environment: "node",
    include: ["tests/integration/**/*.test.ts"],
    testTimeout: 30000,
    setupFiles: ["tests/setup.ts"],
    /**
     * Integration tests run sequentially — they hit a real local API
     * and depend on state (tenant creation, execution ordering, etc.).
     */
    sequence: {
      concurrent: false,
    },
  },
});
