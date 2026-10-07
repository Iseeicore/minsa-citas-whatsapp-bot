import { afterEach, describe, expect, it } from "vitest";
import { CONFIG_ERRORS, checkConfig, reportConfigIssues } from "@/lib/config/config-errors";
import { configureLogger } from "@/lib/observability/logger";

const PORTAL = "https://portal-prueba.example.test";

describe("MINSA_DIGITAL_APP_URL faltante según el modo del MINSA", () => {
  let restore: () => void = () => {};

  afterEach(() => {
    restore();
  });

  const logged = (env: Record<string, string | undefined>) => {
    const lines: Array<Record<string, unknown>> = [];
    restore = configureLogger({ sink: (_level, line) => lines.push(JSON.parse(line)), level: "info" });
    const issues = reportConfigIssues(env);
    return { issues, lines };
  };

  it("con el MINSA real es un error de configuración", () => {
    const { issues, lines } = logged({ SANDBOX_USE_REAL_MINSA: "true" });

    expect(issues.map((issue) => issue.code)).toEqual(["MINSA_DIGITAL_APP_URL_MISSING"]);
    expect(lines).toEqual([
      expect.objectContaining({ level: "error", event: "config.invalid", issue: "MINSA_DIGITAL_APP_URL_MISSING" }),
    ]);
  });

  it("con el MINSA simulado sigue siendo un aviso", () => {
    const { lines } = logged({ SANDBOX_USE_REAL_MINSA: "false" });

    expect(lines).toEqual([
      expect.objectContaining({ level: "warn", event: "config.invalid", issue: "MINSA_DIGITAL_APP_URL_MISSING" }),
    ]);
  });

  it("sin definir el modo del MINSA se trata como simulado", () => {
    const { lines } = logged({});

    expect(lines).toEqual([expect.objectContaining({ level: "warn", issue: "MINSA_DIGITAL_APP_URL_MISSING" })]);
  });

  it("con la variable definida no hay problema en ningún modo", () => {
    expect(checkConfig({ SANDBOX_USE_REAL_MINSA: "true", MINSA_DIGITAL_APP_URL: PORTAL })).toEqual([]);
    expect(logged({ SANDBOX_USE_REAL_MINSA: "true", MINSA_DIGITAL_APP_URL: PORTAL }).lines).toEqual([]);
  });

  it("el mensaje avisa que las llamadas autenticadas al MINSA se cortan", () => {
    expect(CONFIG_ERRORS.MINSA_DIGITAL_APP_URL_MISSING.message).toContain("se cortan");
  });
});
