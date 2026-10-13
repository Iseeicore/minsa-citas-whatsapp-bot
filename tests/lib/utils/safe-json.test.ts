import { describe, expect, it } from "vitest";
import { parseJsonOr } from "@/lib/utils/safe-json";

describe("parseJsonOr", () => {
  it("devuelve el valor interpretado cuando el texto es JSON válido", () => {
    expect(parseJsonOr('{"a":1,"b":["x"]}', null)).toEqual({ a: 1, b: ["x"] });
    expect(parseJsonOr("[1,2]", null)).toEqual([1, 2]);
    expect(parseJsonOr('"texto"', null)).toBe("texto");
    expect(parseJsonOr("12", null)).toBe(12);
  });

  it("devuelve null cuando el JSON es null, no el respaldo", () => {
    expect(parseJsonOr("null", "respaldo")).toBeNull();
  });

  it("devuelve el respaldo cuando el texto no es JSON", () => {
    const fallback = { vacio: true };

    expect(parseJsonOr("{no es json", fallback)).toBe(fallback);
    expect(parseJsonOr("", fallback)).toBe(fallback);
    expect(parseJsonOr("undefined", undefined)).toBeUndefined();
  });

  it("nunca lanza", () => {
    expect(() => parseJsonOr("{", [])).not.toThrow();
  });
});
