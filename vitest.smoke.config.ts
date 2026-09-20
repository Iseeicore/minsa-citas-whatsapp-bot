import { defineConfig } from "vitest/config";
import path from "node:path";

// Smoke tests against real infrastructure (Neon). Kept out of the default
// config so `npm test` never opens a real database connection.
export default defineConfig({
  resolve: {
    alias: {
      "@": path.resolve(__dirname),
    },
  },
  test: {
    environment: "node",
    include: ["tests/smoke/**/*.test.ts"],
    setupFiles: ["tests/smoke/load-env.ts"],
    testTimeout: 60_000,
    hookTimeout: 60_000,
    // One file, run its tests in order: they measure latency and must not compete.
    fileParallelism: false,
  },
});
