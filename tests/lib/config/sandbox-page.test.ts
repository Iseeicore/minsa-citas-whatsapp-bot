import { describe, expect, it } from "vitest";
import { HEALTH_PATH, SANDBOX_PATH, homeDestination, isSandboxPageEnabled } from "@/lib/config/sandbox-page";

describe("isSandboxPageEnabled", () => {
  it("shows the pages only when SANDBOX_PAGE_ENABLED is exactly true", () => {
    expect(isSandboxPageEnabled({ SANDBOX_PAGE_ENABLED: "true" })).toBe(true);
  });

  it.each([undefined, "", "false", "TRUE", "True", "1", "yes", " true"])("hides the pages when the value is %j", (value) => {
    expect(isSandboxPageEnabled({ SANDBOX_PAGE_ENABLED: value })).toBe(false);
  });

  it("hides the pages when the variable is not defined", () => {
    expect(isSandboxPageEnabled({})).toBe(false);
  });

  it("does not depend on SANDBOX_ENABLED, which only controls POST /api/sandbox", () => {
    expect(isSandboxPageEnabled({ SANDBOX_ENABLED: "true" })).toBe(false);
    expect(isSandboxPageEnabled({ SANDBOX_ENABLED: "false", SANDBOX_PAGE_ENABLED: "true" })).toBe(true);
  });
});

describe("homeDestination", () => {
  it("sends the root to the sandbox when the pages are visible", () => {
    expect(homeDestination({ SANDBOX_PAGE_ENABLED: "true" })).toBe(SANDBOX_PATH);
  });

  it("sends the root to the health check when the pages are hidden", () => {
    expect(homeDestination({})).toBe(HEALTH_PATH);
    expect(homeDestination({ SANDBOX_PAGE_ENABLED: "false" })).toBe(HEALTH_PATH);
  });
});
