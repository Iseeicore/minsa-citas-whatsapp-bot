import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { formatWindowCountdown } from "@/lib/utils/format-window-countdown";

describe("formatWindowCountdown", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-01-01T00:00:00Z"));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("returns null once the window already expired", () => {
    expect(formatWindowCountdown("2025-12-31T23:00:00Z")).toBeNull();
  });

  it("returns null exactly at expiry", () => {
    expect(formatWindowCountdown("2026-01-01T00:00:00Z")).toBeNull();
  });

  it("labels the remaining hours and minutes", () => {
    const result = formatWindowCountdown("2026-01-01T05:30:00Z");
    expect(result).toEqual({
      label: "Ventana de 24h: quedan 5h 30m para responder libremente",
      warning: false,
    });
  });

  it("warns once under one hour remains", () => {
    const result = formatWindowCountdown("2026-01-01T00:45:00Z");
    expect(result).toEqual({
      label: "Ventana de 24h: quedan 0h 45m para responder libremente",
      warning: true,
    });
  });
});
