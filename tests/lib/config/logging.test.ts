import { describe, expect, it } from "vitest";
import { getLogDir, isLogToFileEnabled } from "@/lib/config/logging";

describe("isLogToFileEnabled", () => {
  it.each([undefined, "false", "TRUE", "1"])("keeps the logs on the console when the value is %j", (value) => {
    expect(isLogToFileEnabled({ LOG_TO_FILE: value })).toBe(false);
  });
});

describe("getLogDir", () => {
  it("falls back to logs when LOG_DIR is not defined", () => {
    expect(getLogDir({})).toBe("logs");
  });
});
