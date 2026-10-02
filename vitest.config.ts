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
    // Valores inertes: ningún test hace fetch real a esto, solo necesitan existir para que checkConfig/welcome no reporten config faltante.
    env: { DATABASE_URL: "", DATABASE_ENABLED: "true", MINSA_DIGITAL_APP_URL: "https://fake-minsa-digital.test" },
  },
});
