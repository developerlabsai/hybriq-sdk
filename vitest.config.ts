import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    globals: true,
    environment: "node",
    include: ["tests/**/*.test.ts"],
    exclude: ["tests/integration/**", "tests/smoke/**"],
    coverage: {
      provider: "v8",
      include: ["src/**/*.ts"],
      exclude: ["src/cli/**", "src/types/**"],
      reporter: ["text", "text-summary", "lcov"],
      thresholds: {
        // Current baseline — increase as test coverage grows
        // Target: 70/60/70/70 by v0.3.0
        statements: 35,
        branches: 20,
        functions: 40,
        lines: 35,
      },
    },
    testTimeout: 10000,
    setupFiles: ["tests/setup.ts"],
  },
});
