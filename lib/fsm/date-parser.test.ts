import { describe, expect, it } from "vitest";
import { matchFechaText, parseOfferedDate } from "./date-parser";
import type { OfferedRow } from "./selection-matchers";

const row = (id: string): OfferedRow => ({ id, title: id, description: "5 cupo(s) disponibles" });

// "Today" is Monday 2026-09-21.
const TODAY = { year: 2026, month: 9, day: 21 };

const rows = [
  row("22/09/2026"), // Tuesday
  row("23/09/2026"), // Wednesday
  row("25/09/2026"), // Friday
  row("28/09/2026"), // Monday
  row("29/09/2026"), // Tuesday
];

function ids(result: ReturnType<typeof matchFechaText>): string | string[] {
  if (result.kind === "match") return result.row.id;
  if (result.kind === "ambiguous") return result.rows.map((r) => r.id);
  return result.kind;
}

describe("parseOfferedDate", () => {
  it("reads MINSA's DD/MM/YYYY and the fake YYYYMMDD", () => {
    expect(parseOfferedDate("22/09/2026")).toEqual({ year: 2026, month: 9, day: 22 });
    expect(parseOfferedDate("20260922")).toEqual({ year: 2026, month: 9, day: 22 });
    expect(parseOfferedDate("nope")).toBeUndefined();
  });
});

describe("matchFechaText — relative words", () => {
  it.each([
    ["mañana", "22/09/2026"],
    ["Mañana por favor", "22/09/2026"],
    ["pasado mañana", "23/09/2026"],
  ])("%s => %s", (text, id) => {
    expect(ids(matchFechaText(text, rows, TODAY))).toBe(id);
  });

  it("today with no quota is reported as unavailable, not guessed", () => {
    expect(ids(matchFechaText("hoy", rows, TODAY))).toBe("unavailable");
  });

  it("the earliest date for 'lo más pronto' style requests", () => {
    expect(ids(matchFechaText("lo más pronto", rows, TODAY))).toBe("22/09/2026");
    expect(ids(matchFechaText("cualquiera", rows, TODAY))).toBe("22/09/2026");
    expect(ids(matchFechaText("la primera disponible", rows, TODAY))).toBe("22/09/2026");
  });
});

describe("matchFechaText — weekdays", () => {
  it("a weekday with one offered date matches it", () => {
    expect(ids(matchFechaText("el viernes", rows, TODAY))).toBe("25/09/2026");
    expect(ids(matchFechaText("el miércoles", rows, TODAY))).toBe("23/09/2026");
  });

  it("a weekday offered twice narrows to both instead of guessing", () => {
    expect(ids(matchFechaText("el martes", rows, TODAY))).toEqual(["22/09/2026", "29/09/2026"]);
  });

  it("a weekday with no quota is unavailable", () => {
    expect(ids(matchFechaText("el domingo", rows, TODAY))).toBe("unavailable");
  });
});

describe("matchFechaText — explicit dates", () => {
  it.each([
    ["22 de septiembre", "22/09/2026"],
    ["el 23 de septiembre por favor", "23/09/2026"],
    ["22/09", "22/09/2026"],
    ["25-09-2026", "25/09/2026"],
    ["29/9", "29/09/2026"],
    ["el 25", "25/09/2026"],
    ["día 29", "29/09/2026"],
  ])("%s => %s", (text, id) => {
    expect(ids(matchFechaText(text, rows, TODAY))).toBe(id);
  });

  it("a real date that MINSA does not offer is unavailable", () => {
    const result = matchFechaText("5 de octubre", rows, TODAY);
    expect(result).toMatchObject({ kind: "unavailable" });
  });

  it("a day/month already past this year means next year", () => {
    const yearEnd = { year: 2026, month: 12, day: 30 };
    const january = [row("02/01/2027")];
    expect(ids(matchFechaText("2 de enero", january, yearEnd))).toBe("02/01/2027");
  });

  it("works with the fake YYYYMMDD ids too", () => {
    expect(ids(matchFechaText("22/09", [row("20260922")], TODAY))).toBe("20260922");
  });
});

describe("matchFechaText — falls through to other matchers", () => {
  it.each(["la próxima semana", "no sé", "2", "la segunda", ""])("%s is left unparsed", (text) => {
    expect(ids(matchFechaText(text, rows, TODAY))).toBe("unparsed");
  });

  it("'el 2' is not a day when no offered row falls on the 2nd (it is an ordinal)", () => {
    expect(ids(matchFechaText("el 2", rows, TODAY))).toBe("unparsed");
  });
});
