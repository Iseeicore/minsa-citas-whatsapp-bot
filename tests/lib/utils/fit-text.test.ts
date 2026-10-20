import { describe, expect, it } from "vitest";
import { renderWithinLength } from "@/lib/utils/fit-text";

const render = ([first, second]: string[]): string => `A: ${first} | B: ${second}`;

describe("renderWithinLength", () => {
  it("deja el texto igual cuando ya cabe", () => {
    expect(renderWithinLength(["uno", "dos"], render, 100)).toBe("A: uno | B: dos");
  });

  it("acorta solo el primer valor y lo cierra con puntos suspensivos hasta caber justo", () => {
    const result = renderWithinLength(["abcdefghij", "dos"], render, 20);

    expect(result).toBe("A: abcdefg… | B: dos");
    expect(result.length).toBe(20);
  });

  it("si vaciar el primero no alcanza, también acorta el siguiente", () => {
    const result = renderWithinLength(["abcdefghij", "klmnopqrst"], render, 14);

    expect(result).toBe("A:  | B: klmn…");
    expect(result.length).toBe(14);
  });

  it("nunca pasa del máximo aunque todos los valores sean enormes", () => {
    const huge = "x".repeat(5000);

    expect(renderWithinLength([huge, huge], render, 1024).length).toBeLessThanOrEqual(1024);
  });
});
