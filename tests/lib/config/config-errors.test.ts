import { afterEach, describe, expect, it } from "vitest";
import { CONFIG_ERRORS, checkConfig, reportConfigIssues } from "@/lib/config/config-errors";
import { configureLogger } from "@/lib/observability/logger";

const HEALTHY_ENV = {
  MINSA_DIGITAL_APP_URL: "https://dminsadigital.minsa.gob.pe",
  META_APP_SECRET: "secreto",
  META_ACCESS_TOKEN: "token",
  META_PHONE_NUMBER_ID: "123",
};

const codesOf = (env: Record<string, string | undefined>) => checkConfig(env).map((found) => found.code);

describe("checkConfig: missing secrets and hosts", () => {
  it.each([
    ["META_APP_SECRET", "META_APP_SECRET_MISSING"],
    ["META_ACCESS_TOKEN", "META_ACCESS_TOKEN_MISSING"],
    ["META_PHONE_NUMBER_ID", "META_PHONE_NUMBER_ID_MISSING"],
  ])("reports %s missing or blank as an error, without echoing a value", (name, code) => {
    expect(checkConfig({ ...HEALTHY_ENV, [name]: undefined })).toEqual([
      { code, value: "", message: CONFIG_ERRORS[code as keyof typeof CONFIG_ERRORS].message },
    ]);
    expect(codesOf({ ...HEALTHY_ENV, [name]: "  " })).toEqual([code]);
    expect(CONFIG_ERRORS[code as keyof typeof CONFIG_ERRORS].severity).toBe("error");
  });

  it("asks for MINSA_API_HOST and MINSA_INTEGRATION_SECRET only with the real MINSA", () => {
    expect(codesOf(HEALTHY_ENV)).toEqual([]);
    expect(codesOf({ ...HEALTHY_ENV, SANDBOX_USE_REAL_MINSA: "true" })).toEqual([
      "MINSA_API_HOST_MISSING",
      "MINSA_INTEGRATION_SECRET_MISSING",
    ]);
    expect(
      codesOf({
        ...HEALTHY_ENV,
        SANDBOX_USE_REAL_MINSA: "true",
        MINSA_API_HOST: "https://api.example.test",
        MINSA_INTEGRATION_SECRET: "s",
      }),
    ).toEqual([]);
  });

  it("asks for GOOGLE_CLIENT_API only when the real AI is on", () => {
    expect(codesOf(HEALTHY_ENV)).toEqual([]);
    expect(codesOf({ ...HEALTHY_ENV, SANDBOX_USE_REAL_AI: "true" })).toEqual(["GOOGLE_CLIENT_API_MISSING"]);
    expect(codesOf({ ...HEALTHY_ENV, SANDBOX_USE_REAL_AI: "true", GOOGLE_CLIENT_API: "clave" })).toEqual([]);
  });
});

describe("checkConfig", () => {
  it("finds nothing wrong in an environment that sets every checked variable correctly", () => {
    expect(checkConfig(HEALTHY_ENV)).toEqual([]);
  });

  it("accepts an empty AI_PROVIDER and every registered provider", () => {
    expect(checkConfig({ ...HEALTHY_ENV, AI_PROVIDER: "" })).toEqual([]);
    expect(checkConfig({ ...HEALTHY_ENV, AI_PROVIDER: "gemini" })).toEqual([]);
  });

  it("reports an AI_PROVIDER that no provider answers to", () => {
    expect(checkConfig({ ...HEALTHY_ENV, AI_PROVIDER: "gemnini" })).toEqual([
      { code: "AI_PROVIDER_UNKNOWN", value: "gemnini", message: CONFIG_ERRORS.AI_PROVIDER_UNKNOWN.message },
    ]);
  });

  it("reports each SANDBOX_ALLOWED_ORIGINS entry that is not a URL", () => {
    expect(checkConfig({ ...HEALTHY_ENV, SANDBOX_ALLOWED_ORIGINS: "dminsadigital.minsa.gob.pe, https://ok.example.org" })).toEqual([
      {
        code: "SANDBOX_ORIGIN_INVALID",
        value: "dminsadigital.minsa.gob.pe",
        message: CONFIG_ERRORS.SANDBOX_ORIGIN_INVALID.message,
      },
    ]);
  });

  it("reports MINSA_DIGITAL_APP_URL missing or empty (rompe el botón de bienvenida de WhatsApp si no se blinda)", () => {
    expect(checkConfig({ ...HEALTHY_ENV, MINSA_DIGITAL_APP_URL: undefined })).toEqual([
      { code: "MINSA_DIGITAL_APP_URL_MISSING", value: "", message: CONFIG_ERRORS.MINSA_DIGITAL_APP_URL_MISSING.message },
    ]);
    expect(checkConfig({ ...HEALTHY_ENV, MINSA_DIGITAL_APP_URL: "" })).toEqual([
      { code: "MINSA_DIGITAL_APP_URL_MISSING", value: "", message: CONFIG_ERRORS.MINSA_DIGITAL_APP_URL_MISSING.message },
    ]);
    expect(checkConfig(HEALTHY_ENV)).toEqual([]);
  });

  it("describes every code with a message and a log severity", () => {
    for (const entry of Object.values(CONFIG_ERRORS)) {
      expect(entry.message.length).toBeGreaterThan(0);
      expect(["warn", "error"]).toContain(entry.severity);
    }
  });
});

describe("reportConfigIssues", () => {
  let restore: () => void = () => {};

  afterEach(() => {
    restore();
  });

  it("logs each problem as config.invalid at its catalog severity and returns them", () => {
    const lines: Array<Record<string, unknown>> = [];
    restore = configureLogger({ sink: (_level, line) => lines.push(JSON.parse(line)), level: "info" });

    const issues = reportConfigIssues({ ...HEALTHY_ENV, AI_PROVIDER: "gemnini" });

    expect(issues.map((issue) => issue.code)).toEqual(["AI_PROVIDER_UNKNOWN"]);
    expect(lines).toEqual([
      expect.objectContaining({
        level: "error",
        event: "config.invalid",
        issue: "AI_PROVIDER_UNKNOWN",
        value: "gemnini",
        message: CONFIG_ERRORS.AI_PROVIDER_UNKNOWN.message,
      }),
    ]);
  });

  it("logs nothing for a healthy configuration", () => {
    const lines: string[] = [];
    restore = configureLogger({ sink: (_level, line) => lines.push(line), level: "info" });

    expect(reportConfigIssues(HEALTHY_ENV)).toEqual([]);
    expect(lines).toEqual([]);
  });
});
