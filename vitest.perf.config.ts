import { defineConfig } from "vitest/config";
import path from "node:path";

// Wall-clock performance tests (latency percentiles, heap growth, ReDoS bounds).
// Kept out of the default config so they never compete for CPU with the parallel
// suite: their bounds are only meaningful when nothing else is running.
export default defineConfig({
  resolve: {
    alias: {
      "@": path.resolve(__dirname),
    },
  },
  test: {
    environment: "node",
    include: ["tests/stress/performance.test.ts"],
    fileParallelism: false,
  },
});
