import { describe, expect, it } from "vitest";
import { readNumber, readString } from "@/lib/utils/record-readers";

describe("readString", () => {
  it("devuelve el texto sin recortarlo cuando tiene contenido", () => {
    expect(readString({ k: "abc" }, "k")).toBe("abc");
    expect(readString({ k: " abc " }, "k")).toBe(" abc ");
  });

  it("convierte un número finito a texto", () => {
    expect(readString({ k: 12 }, "k")).toBe("12");
    expect(readString({ k: 0 }, "k")).toBe("0");
  });

  it("devuelve undefined para texto vacío o en blanco, números no finitos, otros tipos y claves ausentes", () => {
    expect(readString({ k: "" }, "k")).toBeUndefined();
    expect(readString({ k: "  " }, "k")).toBeUndefined();
    expect(readString({ k: Number.NaN }, "k")).toBeUndefined();
    expect(readString({ k: Number.POSITIVE_INFINITY }, "k")).toBeUndefined();
    expect(readString({ k: null }, "k")).toBeUndefined();
    expect(readString({ k: true }, "k")).toBeUndefined();
    expect(readString({ k: { a: 1 } }, "k")).toBeUndefined();
    expect(readString({}, "k")).toBeUndefined();
  });
});

describe("readNumber", () => {
  it("devuelve el número finito tal cual", () => {
    expect(readNumber({ k: 3 }, "k")).toBe(3);
    expect(readNumber({ k: 0 }, "k")).toBe(0);
    expect(readNumber({ k: -2.5 }, "k")).toBe(-2.5);
  });

  it("interpreta un texto numérico", () => {
    expect(readNumber({ k: "4" }, "k")).toBe(4);
    expect(readNumber({ k: " 7 " }, "k")).toBe(7);
  });

  it("devuelve undefined para texto vacío o no numérico, números no finitos, otros tipos y claves ausentes", () => {
    expect(readNumber({ k: "" }, "k")).toBeUndefined();
    expect(readNumber({ k: "   " }, "k")).toBeUndefined();
    expect(readNumber({ k: "abc" }, "k")).toBeUndefined();
    expect(readNumber({ k: Number.NaN }, "k")).toBeUndefined();
    expect(readNumber({ k: Number.POSITIVE_INFINITY }, "k")).toBeUndefined();
    expect(readNumber({ k: null }, "k")).toBeUndefined();
    expect(readNumber({ k: true }, "k")).toBeUndefined();
    expect(readNumber({}, "k")).toBeUndefined();
  });
});
