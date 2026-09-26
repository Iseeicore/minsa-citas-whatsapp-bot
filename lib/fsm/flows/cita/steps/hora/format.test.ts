import { describe, expect, it } from "vitest";
import { formatHoraRange, rowToSlot, slotToRow } from "@/lib/fsm/flows/cita/steps/hora/format";

describe("formatHoraRange: 12-hour clock, AM/PM written once", () => {
  it.each([
    ["08:00", "08:15", "8:00 - 8:15 AM"],
    ["13:00", "13:15", "1:00 - 1:15 PM"],
    ["17:50", "18:05", "5:50 - 6:05 PM"],
    ["00:15", "00:30", "12:15 - 12:30 AM"],
  ])("%s-%s in the same half of the day → %s", (start, end, expected) => {
    expect(formatHoraRange(start, end)).toBe(expected);
  });

  it.each([
    ["11:45", "12:00", "11:45 AM - 12:00 PM"],
    ["11:30", "12:30", "11:30 AM - 12:30 PM"],
    ["23:45", "00:15", "11:45 PM - 12:15 AM"],
  ])("%s-%s crossing noon or midnight → %s", (start, end, expected) => {
    expect(formatHoraRange(start, end)).toBe(expected);
  });
});

describe("slotToRow: the citizen sees 12 h, MINSA keeps receiving 24 h", () => {
  it("titles the row in 12 h and keeps the 24 h id", () => {
    const row = slotToRow({ start: "17:50", end: "18:05", cupos: 2 });

    expect(row).toEqual({ id: "17:50|18:05", title: "5:50 - 6:05 PM", description: "2 cupo(s) disponibles" });
    expect(rowToSlot(row)).toEqual({ start: "17:50", end: "18:05", cupos: 0 });
  });
});
