import { describe, expect, it } from "vitest";
import { isFiniteNumber, isNonEmptyString, isObject, isRecord, isString } from "@/lib/utils/type-guards";

describe("isString", () => {
  it("acepta cualquier texto, también el vacío", () => {
    expect(isString("hola")).toBe(true);
    expect(isString("")).toBe(true);
  });

  it("rechaza todo lo que no es un texto primitivo", () => {
    for (const value of [undefined, null, 0, 7, true, false, {}, [], ["a"], new String("a"), Symbol("a")]) {
      expect(isString(value)).toBe(false);
    }
  });

  it("estrecha el tipo a string", () => {
    const value: unknown = "abc";

    expect(isString(value) ? value.toUpperCase() : "").toBe("ABC");
  });
});

describe("isNonEmptyString", () => {
  it("acepta un texto con al menos un carácter que no sea espacio", () => {
    expect(isNonEmptyString("a")).toBe(true);
    expect(isNonEmptyString("  a  ")).toBe(true);
  });

  it("rechaza el texto vacío y el que solo tiene espacios", () => {
    expect(isNonEmptyString("")).toBe(false);
    expect(isNonEmptyString("   ")).toBe(false);
    expect(isNonEmptyString("\t\n")).toBe(false);
  });

  it("rechaza lo que no es texto", () => {
    for (const value of [undefined, null, 0, 12, true, {}, ["a"]]) {
      expect(isNonEmptyString(value)).toBe(false);
    }
  });
});

describe("isFiniteNumber", () => {
  it("acepta números finitos, incluido el cero y los negativos", () => {
    expect(isFiniteNumber(0)).toBe(true);
    expect(isFiniteNumber(-3.5)).toBe(true);
    expect(isFiniteNumber(1700000000)).toBe(true);
  });

  it("rechaza NaN, los infinitos y los números escritos como texto", () => {
    for (const value of [Number.NaN, Number.POSITIVE_INFINITY, Number.NEGATIVE_INFINITY, "12", "", null, undefined, true]) {
      expect(isFiniteNumber(value)).toBe(false);
    }
  });
});

describe("isObject", () => {
  it("acepta objetos, arreglos e instancias", () => {
    expect(isObject({})).toBe(true);
    expect(isObject({ code: "P2002" })).toBe(true);
    expect(isObject([])).toBe(true);
    expect(isObject(new Error("x"))).toBe(true);
  });

  it("rechaza null, los primitivos y las funciones", () => {
    for (const value of [null, undefined, "a", 1, true, () => undefined]) {
      expect(isObject(value)).toBe(false);
    }
  });
});

describe("isRecord", () => {
  it("acepta un objeto que no es arreglo", () => {
    expect(isRecord({})).toBe(true);
    expect(isRecord({ a: 1 })).toBe(true);
  });

  it("rechaza los arreglos, null y los primitivos", () => {
    for (const value of [[], [{ a: 1 }], null, undefined, "a", 1, false]) {
      expect(isRecord(value)).toBe(false);
    }
  });

  it("estrecha el tipo para leer claves", () => {
    const value: unknown = { nombre: "Ana" };

    expect(isRecord(value) ? value.nombre : undefined).toBe("Ana");
  });
});
