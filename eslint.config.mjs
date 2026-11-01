import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  {
    files: ["**/*.{ts,tsx}"],
    rules: {
      "no-restricted-imports": [
        "error",
        { patterns: [{ group: ["./*", "../*"], message: "Use the @/ alias instead of relative imports." }] },
      ],
      "import/no-cycle": ["error", { allowUnsafeDynamicCyclicDependency: true }],
    },
  },
  {
    files: ["lib/fsm/**/*.ts"],
    rules: {
      "no-restricted-imports": [
        "error",
        {
          paths: [{ name: "@/lib/enums/http-status", message: "HTTP status codes belong to routes and HTTP clients, not to the FSM." }],
          patterns: [{ group: ["./*", "../*"], message: "Use the @/ alias instead of relative imports." }],
        },
      ],
    },
  },
  globalIgnores([".next/**", "out/**", "build/**", "next-env.d.ts"]),
]);

export default eslintConfig;
