import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const ROOT = process.cwd();
const config = fs.readFileSync(path.join(ROOT, "vitest.config.ts"), "utf8");
const envBlock = config.match(/env:\s*\{([^}]*)\}/)?.[1] ?? "";

describe("vitest.config.ts pins the persistence mode", () => {
  it("pins DATABASE_ENABLED instead of letting a local .env decide it", () => {
    expect(envBlock).toContain('DATABASE_ENABLED: "true"');
  });

  it("keeps DATABASE_URL empty so no test can reach a real database", () => {
    expect(envBlock).toContain('DATABASE_URL: ""');
  });

  it("turns the incidencias on, because the incident and consulta tests assume them; the tests of the off mode stub it", () => {
    expect(envBlock).toContain('INCIDENCIAS_ENABLED: "true"');
  });
});
