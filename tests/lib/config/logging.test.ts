import { describe, expect, it } from "vitest";
import { getLogDir, isLogToFileEnabled } from "@/lib/config/logging";

describe("isLogToFileEnabled", () => {
  it("writes files only when LOG_TO_FILE is exactly true", () => {
    expect(isLogToFileEnabled({ LOG_TO_FILE: "true" })).toBe(true);
  });

  it.each([undefined, "", "false", "TRUE", "1"])("keeps the logs on the console when the value is %j", (value) => {
    expect(isLogToFileEnabled({ LOG_TO_FILE: value })).toBe(false);
  });
});

describe("getLogDir", () => {
  it.each([undefined, ""])("falls back to logs when LOG_DIR is %j", (value) => {
    expect(getLogDir({ LOG_DIR: value })).toBe("logs");
  });

  it("uses LOG_DIR when it is set", () => {
    expect(getLogDir({ LOG_DIR: "custom-logs" })).toBe("custom-logs");
  });
});
