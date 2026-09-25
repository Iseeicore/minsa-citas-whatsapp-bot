import { defineConfig } from "vitest/config";
import path from "node:path";

export default defineConfig({
  resolve: {
    alias: {
      "@": path.resolve(__dirname),
    },
  },
  test: {
    environment: "node",
    include: ["lib/**/*.test.ts", "tests/**/*.test.ts"],
    // Real-infrastructure smoke tests run only via `npm run smoke:neon`.
    // Wall-clock performance tests run alone via `npm run test:perf`: sharing the
    // CPU with the parallel suite makes their latency and heap bounds flaky.
    exclude: ["tests/smoke/**", "tests/stress/performance.test.ts", "node_modules/**"],
  },
});
