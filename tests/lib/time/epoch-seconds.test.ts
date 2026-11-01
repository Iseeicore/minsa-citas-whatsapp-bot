import { describe, expect, it } from "vitest";
import { fromUnixSeconds, toUnixSeconds } from "@/lib/time/epoch-seconds";

describe("epoch seconds", () => {
  it("toUnixSeconds drops the milliseconds of a Date or of a number of milliseconds", () => {
    expect(toUnixSeconds(new Date("2026-10-31T12:00:00.999Z"))).toBe(1793448000);
    expect(toUnixSeconds(1793448000999)).toBe(1793448000);
  });

  it("fromUnixSeconds reads a number or the string WhatsApp sends", () => {
    expect(fromUnixSeconds(1793448000).toISOString()).toBe("2026-10-31T12:00:00.000Z");
    expect(fromUnixSeconds("1793448000").toISOString()).toBe("2026-10-31T12:00:00.000Z");
  });
});
