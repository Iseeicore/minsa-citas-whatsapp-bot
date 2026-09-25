import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  {
    files: ["**/*.{ts,tsx}"],
    rules: {
      // Every import names its full path from the project root, so a reader
      // (human or tool) knows where a module lives without resolving it.
      "no-restricted-imports": [
        "error",
        { patterns: [{ group: ["./*", "../*"], message: "Use the @/ alias instead of relative imports." }] },
      ],
      // Keeps the per-step modules decoupled: no module may import itself back.
      // A chain through a dynamic import() is allowed: turn-lock.ts loads its
      // database layer lazily on purpose, so it never opens a connection early.
      "import/no-cycle": ["error", { allowUnsafeDynamicCyclicDependency: true }],
    },
  },
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
  ]),
]);

export default eslintConfig;
