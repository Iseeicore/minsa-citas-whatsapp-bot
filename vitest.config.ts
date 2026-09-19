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
    exclude: ["tests/smoke/**", "node_modules/**"],
  },
});
