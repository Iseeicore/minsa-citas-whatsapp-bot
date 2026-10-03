import { describe, expect, it } from "vitest";
import { namesMatch, normalizeText } from "@/lib/fsm/parsing/text";

describe("normalizeText", () => {
  it("strips accents, uppercases and collapses whitespace", () => {
    expect(normalizeText("  Ñandú   Pérez ")).toBe("NANDU PEREZ");
  });
});

describe("namesMatch", () => {
  it("matches regardless of order, accents and case", () => {
    expect(namesMatch("juan quispe", "JUAN CARLOS QUISPE PEREZ")).toBe(true);
    expect(namesMatch("Pérez Quispe", "JUAN CARLOS QUISPE PEREZ")).toBe(true);
  });

  it("rejects a name with a token the official name lacks", () => {
    expect(namesMatch("Pedro Quispe", "JUAN CARLOS QUISPE PEREZ")).toBe(false);
  });
});
