import { describe, expect, it } from "vitest";
import { arrayOr } from "@/lib/utils/array-values";

describe("arrayOr", () => {
  it("devuelve el mismo arreglo cuando el valor ya es un arreglo", () => {
    const rows = [{ id: 1 }, { id: 2 }];

    expect(arrayOr(rows)).toBe(rows);
    expect(arrayOr([])).toEqual([]);
  });

  it("devuelve un arreglo vacío por defecto cuando no es un arreglo", () => {
    for (const value of [undefined, null, "abc", 3, true, {}, { length: 2 }]) {
      expect(arrayOr(value)).toEqual([]);
    }
  });

  it("devuelve el respaldo indicado cuando no es un arreglo", () => {
    const fallback = ["respaldo"];

    expect(arrayOr("x", fallback)).toBe(fallback);
  });

  it("no comparte el arreglo vacío por defecto entre llamadas", () => {
    const first = arrayOr<string>(undefined);
    first.push("a");

    expect(arrayOr<string>(undefined)).toEqual([]);
  });
});
