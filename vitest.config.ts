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
    exclude: ["tests/smoke/**", "tests/stress/performance.test.ts", "node_modules/**"],
    env: { DATABASE_URL: "" },
  },
});
