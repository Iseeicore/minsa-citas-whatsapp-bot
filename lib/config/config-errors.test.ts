import { afterEach, describe, expect, it } from "vitest";
import { CONFIG_ERRORS, checkConfig, reportConfigIssues } from "@/lib/config/config-errors";
import { configureLogger } from "@/lib/observability/logger";

describe("checkConfig", () => {
  it("finds nothing wrong in an environment that sets none of the checked variables", () => {
    expect(checkConfig({})).toEqual([]);
  });

  it("accepts an empty AI_PROVIDER and every registered provider", () => {
    expect(checkConfig({ AI_PROVIDER: "" })).toEqual([]);
    expect(checkConfig({ AI_PROVIDER: "gemini" })).toEqual([]);
  });

  it("reports an AI_PROVIDER that no provider answers to", () => {
    expect(checkConfig({ AI_PROVIDER: "gemnini" })).toEqual([
      { code: "AI_PROVIDER_UNKNOWN", value: "gemnini", message: CONFIG_ERRORS.AI_PROVIDER_UNKNOWN.message },
    ]);
  });

  it("reports each SANDBOX_ALLOWED_ORIGINS entry that is not a URL", () => {
    expect(checkConfig({ SANDBOX_ALLOWED_ORIGINS: "dminsadigital.minsa.gob.pe, https://ok.example.org" })).toEqual([
      {
        code: "SANDBOX_ORIGIN_INVALID",
        value: "dminsadigital.minsa.gob.pe",
        message: CONFIG_ERRORS.SANDBOX_ORIGIN_INVALID.message,
      },
    ]);
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

    const issues = reportConfigIssues({ AI_PROVIDER: "gemnini" });

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

    expect(reportConfigIssues({})).toEqual([]);
    expect(lines).toEqual([]);
  });
});
