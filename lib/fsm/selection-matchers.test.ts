import { describe, expect, it } from "vitest";
import { matchSelection, readOffered, serializeOffered, type OfferedRow } from "./selection-matchers";

const ubigeoRows: OfferedRow[] = [
  { id: "150101", title: "San Juan de Lurigancho", description: "Lima — Lima" },
  { id: "150102", title: "San Juan de Miraflores", description: "Lima — Lima" },
  { id: "150701", title: "San Juan de Iris", description: "Huarochirí — Lima" },
  { id: "150702", title: "San Juan de Tantaranche", description: "Huarochirí — Lima" },
];

const especialidadRows: OfferedRow[] = [
  { id: "01", title: "MEDICINA GENERAL", description: "5 cupo(s) disponibles" },
  { id: "02", title: "ODONTOLOGIA", description: "3 cupo(s) disponibles" },
  { id: "03", title: "PEDIATRIA", description: "2 cupo(s) disponibles" },
];

function matchedId(text: string, rows: OfferedRow[], includeDescription = false) {
  const result = matchSelection(text, rows, { includeDescription });
  return result.kind === "match" ? result.row.id : result.kind;
}

describe("matchSelection — ordinals", () => {
  it.each([
    ["1", "150101"],
    ["2", "150102"],
    ["la 2", "150102"],
    ["el 3", "150701"],
    ["opción 4", "150702"],
    ["primero", "150101"],
    ["la primera", "150101"],
    ["el segundo", "150102"],
    ["el tercero", "150701"],
    ["cuarto", "150702"],
    ["la última", "150702"],
    ["quiero el 2", "150102"],
  ])("%s => %s", (text, id) => {
    expect(matchedId(text, ubigeoRows)).toBe(id);
  });

  it("an out-of-range ordinal does not match anything", () => {
    expect(matchedId("9", ubigeoRows)).toBe("none");
  });
});

describe("matchSelection — names over the offered rows", () => {
  it("matches a full name, a partial name and ignores accents/case", () => {
    expect(matchedId("San Juan de Lurigancho", ubigeoRows)).toBe("150101");
    expect(matchedId("lurigancho", ubigeoRows)).toBe("150101");
    expect(matchedId("MIRAFLORES", ubigeoRows)).toBe("150102");
    expect(matchedId("odontología", especialidadRows)).toBe("02");
    expect(matchedId("quiero pediatria por favor", especialidadRows)).toBe("03");
  });

  it("uses provincia/departamento only when descriptions are included", () => {
    expect(matchSelection("el de Huarochiri", ubigeoRows, { includeDescription: true })).toMatchObject({
      kind: "ambiguous",
      rows: [{ id: "150701" }, { id: "150702" }],
    });
    expect(matchedId("el de Huarochiri", ubigeoRows, false)).toBe("none");
  });

  it("reports ambiguity instead of guessing", () => {
    const result = matchSelection("san juan", ubigeoRows);
    expect(result.kind).toBe("ambiguous");
    if (result.kind === "ambiguous") expect(result.rows).toHaveLength(4);
  });

  it("matches a name typed in full against a truncated row title", () => {
    const rows: OfferedRow[] = [
      { id: "a", title: "San Juan de Lurigan…", description: "Lima — Lima" },
      { id: "b", title: "San Juan de Miraflor…", description: "Lima — Lima" },
    ];
    expect(matchedId("San Juan de Lurigancho", rows)).toBe("a");
  });

  it("returns none for text that names nothing offered", () => {
    expect(matchedId("xyz", ubigeoRows)).toBe("none");
    expect(matchedId("sí", especialidadRows)).toBe("none");
    expect(matchedId("", especialidadRows)).toBe("none");
    expect(matchedId("150101|x|y", ubigeoRows)).toBe("none");
  });
});

describe("offered options slot", () => {
  it("round-trips through a JSON string slot", () => {
    const offered = { text: "Selecciona la especialidad:", rows: especialidadRows };
    expect(readOffered({ citaOffered: serializeOffered(offered) })).toEqual(offered);
  });

  it("returns undefined for a missing or corrupt slot", () => {
    expect(readOffered({})).toBeUndefined();
    expect(readOffered({ citaOffered: "not json" })).toBeUndefined();
    expect(readOffered({ citaOffered: JSON.stringify({ text: 1 }) })).toBeUndefined();
  });
});
