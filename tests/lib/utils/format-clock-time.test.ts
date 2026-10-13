import { describe, expect, it } from "vitest";
import { formatClockTime } from "@/lib/utils/format-clock-time";

const TIMESTAMP = "2026-10-01T15:04:00.000Z";

describe("formatClockTime", () => {
  it("da la hora y los minutos a dos dígitos en la configuración regional del navegador", () => {
    expect(formatClockTime(TIMESTAMP)).toBe(new Date(TIMESTAMP).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }));
  });

  it("no incluye los segundos", () => {
    const withSeconds = new Date(TIMESTAMP).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" });

    expect(formatClockTime(TIMESTAMP).length).toBeLessThan(withSeconds.length);
  });
});
