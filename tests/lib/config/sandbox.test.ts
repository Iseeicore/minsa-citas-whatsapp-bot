import { describe, expect, it } from "vitest";
import { isSandboxEnabled } from "@/lib/config/sandbox";

describe("isSandboxEnabled", () => {
  it("turns the Chat-bot on only when SANDBOX_ENABLED is exactly true", () => {
    expect(isSandboxEnabled({ SANDBOX_ENABLED: "true" })).toBe(true);
  });

  it.each([undefined, "", "false", "TRUE", "1"])("keeps the Chat-bot off when the value is %j", (value) => {
    expect(isSandboxEnabled({ SANDBOX_ENABLED: value })).toBe(false);
  });

  it("does not depend on SANDBOX_PAGE_ENABLED", () => {
    expect(isSandboxEnabled({ SANDBOX_PAGE_ENABLED: "true" })).toBe(false);
  });
});
