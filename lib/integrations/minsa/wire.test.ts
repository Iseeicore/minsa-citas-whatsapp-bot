import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { endOfMonthYYYYMMDD, todayYYYYMMDD } from "@/lib/integrations/minsa/wire";

describe("MINSA date window uses the Lima calendar day, whatever the server time zone", () => {
  beforeEach(() => {
    vi.stubEnv("TZ", "UTC");
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllEnvs();
  });

  it("at 23:30 in Lima (04:30 UTC of the next day) today is still the Lima date", () => {
    vi.setSystemTime(new Date("2026-10-01T04:30:00Z"));

    expect(todayYYYYMMDD()).toBe("20260930");
  });

  it("the end of month is the last day of the Lima month, not of the UTC month", () => {
    vi.setSystemTime(new Date("2026-10-01T04:30:00Z"));

    expect(endOfMonthYYYYMMDD()).toBe("20260930");
  });

  it("during the Lima day both match the ordinary calendar", () => {
    vi.setSystemTime(new Date("2026-02-10T15:00:00Z"));

    expect(todayYYYYMMDD()).toBe("20260210");
    expect(endOfMonthYYYYMMDD()).toBe("20260228");
  });
});
