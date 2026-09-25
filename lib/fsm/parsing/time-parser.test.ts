import { describe, expect, it } from "vitest";
import { matchHoraText, packHoraSlots, unpackHoraSlots, type HoraSlot } from "@/lib/fsm/parsing/time-parser";

const slot = (start: string, end: string, cupos = 1): HoraSlot => ({ start, end, cupos });

const day: HoraSlot[] = [
  slot("07:00", "07:30"),
  slot("08:00", "08:30"),
  slot("08:45", "09:15"),
  slot("09:30", "10:00"),
  slot("12:00", "12:30"),
  slot("13:00", "13:30"),
  slot("13:15", "13:45"),
  slot("13:45", "14:15"),
  slot("14:30", "15:00"),
  slot("19:00", "19:30"),
];

function result(text: string, slots: HoraSlot[] = day): string | string[] {
  const match = matchHoraText(text, slots);
  if (match.kind === "exact") return match.slot.start;
  if (match.kind === "several") return match.slots.map((s) => s.start);
  return match.kind;
}

describe("matchHoraText — 12h / 24h and words", () => {
  it.each([
    ["13:45", "13:45"],
    ["1:45 pm", "13:45"],
    ["1:45 p.m.", "13:45"],
    ["1345", "13:45"],
    ["9 y media", "09:30"],
    ["a las nueve y media", "09:30"],
    ["930", "09:30"],
    ["a las 8:45", "08:45"],
    ["mediodía", "12:00"],
    ["7 de la noche", "19:00"],
    ["quiero a la una y cuarto de la tarde", "13:15"],
    ["a la 1 y 15", "13:15"],
    ["dos y media de la tarde", "14:30"],
  ])("%s => exactly %s", (text, start) => {
    expect(result(text)).toBe(start);
  });

  it("an hour with no minutes lists every offered slot in that hour", () => {
    expect(result("a la 1")).toEqual(["13:00", "13:15", "13:45"]);
    expect(result("a la 1 de la tarde")).toEqual(["13:00", "13:15", "13:45"]);
    expect(result("1 pm")).toEqual(["13:00", "13:15", "13:45"]);
    expect(result("13")).toEqual(["13:00", "13:15", "13:45"]);
    expect(result("a las 8")).toEqual(["08:00", "08:45"]);
  });

  it("'las 7' is an hour, not a list position; both 07:00 and 19:00 are offered", () => {
    expect(result("las 7")).toEqual(["07:00", "19:00"]);
    expect(result("a las 7 de la mañana")).toBe("07:00");
  });

  it("uses the period words to settle 12h ambiguity", () => {
    expect(result("1 de la mañana")).toBe("unavailable");
    expect(result("a las 7 de la noche")).toBe("19:00");
  });

  it("'menos cuarto' counts back from the hour", () => {
    expect(result("diez menos cuarto")).toBe("unavailable");
    expect(result("dos menos cuarto de la tarde")).toBe("13:45");
  });
});

describe("matchHoraText — period only and extremes", () => {
  it("'en la tarde' lists the afternoon slots", () => {
    expect(result("en la tarde")).toEqual(["12:00", "13:00", "13:15", "13:45", "14:30", "19:00"]);
  });

  it("'por la mañana' lists the morning slots", () => {
    expect(result("por la mañana")).toEqual(["07:00", "08:00", "08:45", "09:30"]);
  });

  it("earliest / latest", () => {
    expect(result("lo más temprano")).toBe("07:00");
    expect(result("lo más pronto")).toBe("07:00");
    expect(result("lo más tarde")).toBe("19:00");
    expect(result("la última")).toBe("unparsed");
  });
});

describe("matchHoraText — nothing to decide", () => {
  it("a time MINSA does not offer is unavailable, never guessed", () => {
    expect(result("a las 3")).toBe("unavailable");
    expect(result("9 en punto")).toBe("unavailable");
    expect(result("11:11")).toBe("unavailable");
  });

  it.each([
    "hola",
    "",
    "1",
    "9",
    "la segunda",
    "a las 25",
    "asdf",
    "hdp",
  ])("%j is left for the other matchers", (text) => {
    expect(result(text)).toBe("unparsed");
  });

  it("an empty day never matches", () => {
    expect(result("a la 1", [])).toBe("unparsed");
  });
});

describe("packHoraSlots / unpackHoraSlots", () => {
  it("round-trips through the compact scalar slot", () => {
    const packed = packHoraSlots(day);
    expect(typeof packed).toBe("string");
    expect(unpackHoraSlots(packed)).toEqual(day);
  });

  it("a whole 5-minute day stays small", () => {
    const many: HoraSlot[] = [];
    for (let minutes = 7 * 60; minutes < 19 * 60; minutes += 5) {
      const pad = (n: number) => String(n).padStart(2, "0");
      const start = `${pad(Math.floor(minutes / 60))}:${pad(minutes % 60)}`;
      const endMinutes = minutes + 5;
      const end = `${pad(Math.floor(endMinutes / 60))}:${pad(endMinutes % 60)}`;
      many.push(slot(start, end, 3));
    }
    expect(packHoraSlots(many).length).toBeLessThan(3500);
  });

  it("returns an empty list for a missing or corrupt slot", () => {
    expect(unpackHoraSlots(undefined)).toEqual([]);
    expect(unpackHoraSlots("garbage")).toEqual([]);
  });
});
