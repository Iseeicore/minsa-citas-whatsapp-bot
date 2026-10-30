import { coverageConfigDefaults, defineConfig } from "vitest/config";
import path from "node:path";

const ARCHIVOS_SOLO_TIPOS = [
  "app/components/sandbox-chat/types.ts",
  "app/components/types.ts",
  "app/components/ui/list-picker-types.ts",
  "lib/fsm/parsing/ai/llm.ts",
  "lib/integrations/minsa/types.ts",
  "lib/observability/types.ts",
  "lib/types/aceptacion-terminos.types.ts",
  "lib/types/almacen-evidencias.types.ts",
  "lib/types/consentimiento.types.ts",
  "lib/types/referencia-lista-detalle.ts",
  "lib/types/sandbox-reply.types.ts",
  "lib/types/whatsapp-limit.types.ts",
  "lib/whatsapp/inbound/inbound-buffer.ts",
];

export default defineConfig({
  resolve: {
    alias: {
      "@": path.resolve(__dirname),
    },
  },
  test: {
    environment: "node",
    include: ["tests/**/*.test.ts"],
    exclude: ["tests/smoke/**", "tests/stress/performance.test.ts", "node_modules/**"],
    env: {
      DATABASE_URL: "",
      DATABASE_ENABLED: "true",
      MINSA_DIGITAL_APP_URL: "https://fake-minsa-digital.test",
      INCIDENCIAS_ENABLED: "true",
    },
    coverage: {
      provider: "v8",
      include: ["lib/**", "app/**"],
      exclude: [...coverageConfigDefaults.exclude, ...ARCHIVOS_SOLO_TIPOS],
      reporter: ["text-summary", ["text-summary", { file: "resumen.txt" }], "html", "json-summary", "cobertura"],
      reportsDirectory: "coverage",
      thresholds: {
        "lib/**": { lines: 95, branches: 94, functions: 97, statements: 95 },
        "app/api/**": { lines: 97, branches: 93, functions: 99, statements: 97 },
        "app/webhook/**": { lines: 94, branches: 70, functions: 99, statements: 94 },
      },
    },
  },
});
