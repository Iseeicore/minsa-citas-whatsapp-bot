import { describe, expect, it } from "vitest";
import distritos from "@/data/peru-distritos.json";
import { evaluateLexicalGuard } from "@/lib/security/lexical-guard";
import { gap } from "@/tests/support/known-gap";
import { levenshtein } from "@/tests/support/levenshtein";

const action = (text: string) => evaluateLexicalGuard(text).action;

type Row = { departamento: string; provincia: string; distrito: string };
const rows = distritos as Row[];

const strip = (text: string) =>
  text
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "");

describe("A.1 legitimate Peruvian inputs must be ALLOW", () => {
  it("'Mi posta es CS San Martín' (CS is a facility prefix, not an insult)", () => {
    expect(action("Mi posta es CS San Martín")).toBe("ALLOW");
  });

  it("'Distrito Lurigancho'", () => {
    expect(action("Distrito Lurigancho")).toBe("ALLOW");
  });

  it("initials with fewer than three letters never compact", () => {
    expect(action("Sr. J. C. Pérez")).toBe("ALLOW");
    expect(action("Ana M. Ruiz")).toBe("ALLOW");
  });

  it("initials that do NOT spell a listed insult are fine", () => {
    expect(action("Ana M. S. D. Ruiz")).toBe("ALLOW");
  });

  it("'Atentamente C. S. M.' (signature initials)", () => {
    expect(action("Atentamente C. S. M.")).toBe("ALLOW");
  });

  it("'Dra. Rosario P. T. M.' (name with initials)", () => {
    expect(action("Dra. Rosario P. T. M.")).toBe("ALLOW");
  });

  it("'Luis C. T. M. Rojas' (initials in the middle of a full name)", () => {
    expect(action("Luis C. T. M. Rojas")).toBe("ALLOW");
  });
});

describe("A.1b official place names and surnames (the district step runs the guard)", () => {
  const placeNames = [
    ...new Set(rows.flatMap((row) => [row.departamento, row.provincia, row.distrito])),
  ];

  it("the dataset is the full INEI list", () => {
    expect(rows.length).toBeGreaterThan(1800);
    expect(placeNames.length).toBeGreaterThan(1500);
  });

  it("no INEI department / province / district name is flagged", () => {
    const offenders = placeNames.filter((name) => action(name) !== "ALLOW");
    expect(offenders).toEqual([]);
  });

  it("no place name is flagged (diagnostic output for the record)", () => {
    const offenders = placeNames.filter((name) => action(name) !== "ALLOW");
    console.info(`[A.1b] flagged place names: ${JSON.stringify(offenders)}`);
    expect(Array.isArray(offenders)).toBe(true);
  });

  it("common Peruvian surnames and given names are ALLOW", () => {
    const names = [
      "Quispe", "Huamán", "Mamani", "Flores", "García", "Vásquez", "Castillo", "Ramírez", "Torres",
      "Espinoza", "Chávez", "Tarazona", "Estupiñán", "Rojas", "Condori", "Choque", "Apaza", "Ccori",
      "Rosario", "Isaac", "Marc", "Imelda", "Idalia", "Teodora", "Magdalena", "Guadalupe",
      "Mercedes", "Esperanza", "Soledad", "Perez Tarrillo",
    ];
    const offenders = names.filter((name) => action(name) !== "ALLOW");
    expect(offenders).toEqual([]);
  });
});

describe("A.2 evasions", () => {
  it.each(["cojuuudooos", "m.i.e.r.d.a", "estup1d0", "i d i o t a", "hij0 de put4", "c0nch4tumadre"])(
    "detects %s",
    (text) => {
      expect(action(text)).toBe("DROP_AND_WARN");
    },
  );

  it("1mb3c1lazo (leetspeak + augmentative suffix)", () => {
    expect(action("1mb3c1lazo")).toBe("DROP_AND_WARN");
  });

  it("im.be.cil (syllables split by dots)", () => {
    expect(action("im.be.cil")).toBe("DROP_AND_WARN");
  });

  it("hdpp (doubled consonant of a listed abbreviation)", () => {
    expect(action("hdpp")).toBe("DROP_AND_WARN");
  });

  gap("idotoaia (heavy typo of idiota)", () => {
    expect(action("idotoaia")).toBe("DROP_AND_WARN");
  });
});

describe("A.2b the proposed relative-distance ratio, measured", () => {
  const targets = ["idiota", "imbecil", "estupido", "tarado", "cojudo", "huevon", "mierda", "pendejo", "malparido"];

  const districtWords = rows
    .flatMap((row) => strip(row.distrito).split(/[^a-z]+/))
    .filter((word) => word.length >= 5);

  const flaggedAt = (ratio: number) =>
    new Set(
      districtWords.filter((word) =>
        targets.some(
          (target) =>
            word[0] === target[0] &&
            Math.abs(word.length - target.length) <= 3 &&
            levenshtein(word, target) / target.length <= ratio,
        ),
      ),
    );

  it("'idotoaia' is 4 edits from 'idiota' (ratio 0.67), not 3", () => {
    expect(levenshtein("idotoaia", "idiota")).toBe(4);
    expect(levenshtein("idotoaia", "idiota") / "idiota".length).toBeCloseTo(0.667, 2);
  });

  it("ratio <= 0.35 does NOT catch 'idotoaia'", () => {
    const caught = targets.some((target) => levenshtein("idotoaia", target) / target.length <= 0.35);
    expect(caught).toBe(false);
  });

  it("even ratio <= 0.50 does not catch it, and would flag dozens of real district words", () => {
    const caught = targets.some((target) => levenshtein("idotoaia", target) / target.length <= 0.5);
    expect(caught).toBe(false);

    const flagged = flaggedAt(0.5);
    console.info(`[A.2b] ratio 0.50 flags ${flagged.size} district words, e.g. ${[...flagged].slice(0, 8).join(", ")}`);
    expect(flagged.size).toBeGreaterThan(20);
  });

  it("ratio <= 0.35 would flag real districts, including Tarata and Taraco", () => {
    const flagged = flaggedAt(0.35);
    console.info(`[A.2b] ratio 0.35 flags district words: ${[...flagged].join(", ")}`);
    expect(flagged.has("tarata")).toBe(true);
    expect(flagged.has("taraco")).toBe(true);
  });
});
