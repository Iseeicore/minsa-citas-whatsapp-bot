import { describe, expect, it } from "vitest";
import { stringOr, stringOrUndefined, stripAccents, toText } from "@/lib/utils/text-values";

describe("toText", () => {
  it("devuelve el texto tal cual, sin recortarlo", () => {
    expect(toText("hola")).toBe("hola");
    expect(toText("  a ")).toBe("  a ");
    expect(toText("")).toBe("");
  });

  it("convierte null y undefined en texto vacío", () => {
    expect(toText(null)).toBe("");
    expect(toText(undefined)).toBe("");
  });

  it("convierte números y booleanos a su texto, incluidos el cero y false", () => {
    expect(toText(0)).toBe("0");
    expect(toText(15)).toBe("15");
    expect(toText(false)).toBe("false");
    expect(toText(true)).toBe("true");
  });

  it("da el mismo resultado que String(valor ?? \"\") para cualquier valor", () => {
    for (const value of ["x", "", 0, 1.5, Number.NaN, true, false, null, undefined, {}, [], [1, 2], { a: 1 }]) {
      expect(toText(value)).toBe(String(value ?? ""));
    }
  });
});

describe("stringOr", () => {
  it("devuelve el valor cuando es texto, también si está vacío", () => {
    expect(stringOr("hola")).toBe("hola");
    expect(stringOr("", "respaldo")).toBe("");
  });

  it("devuelve texto vacío por defecto cuando no es texto", () => {
    for (const value of [undefined, null, 0, 42, true, {}, []]) {
      expect(stringOr(value)).toBe("");
    }
  });

  it("devuelve el respaldo indicado cuando no es texto, sin convertir números", () => {
    expect(stringOr(42, "respaldo")).toBe("respaldo");
    expect(stringOr(undefined, "respaldo")).toBe("respaldo");
  });
});

describe("stringOrUndefined", () => {
  it("devuelve el valor cuando es texto, también si está vacío", () => {
    expect(stringOrUndefined("hola")).toBe("hola");
    expect(stringOrUndefined("")).toBe("");
  });

  it("devuelve undefined cuando no es texto", () => {
    for (const value of [undefined, null, 0, 42, false, {}, ["a"]]) {
      expect(stringOrUndefined(value)).toBeUndefined();
    }
  });
});

describe("stripAccents", () => {
  it("quita tildes y diéresis sin tocar mayúsculas, espacios ni signos", () => {
    expect(stripAccents("Atención  Pediátrica")).toBe("Atencion  Pediatrica");
    expect(stripAccents("  ÁÉÍÓÚ áéíóú ü Ü  ")).toBe("  AEIOU aeiou u U  ");
    expect(stripAccents("¿Cuándo?")).toBe("¿Cuando?");
  });

  it("convierte la eñe en ene, igual que la normalización NFD", () => {
    expect(stripAccents("año Ñandú")).toBe("ano Nandu");
  });

  it("deja igual un texto sin acentos y el texto vacío", () => {
    expect(stripAccents("hola 123")).toBe("hola 123");
    expect(stripAccents("")).toBe("");
  });

  it("da el mismo resultado en llamadas seguidas", () => {
    expect(stripAccents("canción")).toBe("cancion");
    expect(stripAccents("canción")).toBe("cancion");
  });
});
