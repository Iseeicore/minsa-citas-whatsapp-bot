import { afterEach, describe, expect, it, vi } from "vitest";
import { isInboundRateLimitEnabled } from "@/lib/config/rate-limit";

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("isInboundRateLimitEnabled", () => {
  it("turns off only with the exact value off", () => {
    vi.stubEnv("INBOUND_RATE_LIMIT", "off");

    expect(isInboundRateLimitEnabled()).toBe(false);
  });

  it.each([undefined, "", "on", "OFF", "false", "0"])("stays on with %j", (value) => {
    vi.stubEnv("INBOUND_RATE_LIMIT", value);

    expect(isInboundRateLimitEnabled()).toBe(true);
  });
});
