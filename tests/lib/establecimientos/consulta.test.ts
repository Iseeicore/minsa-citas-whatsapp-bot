import { describe, expect, it } from "vitest";
import { normalizarConsulta, variantesConsulta } from "@/lib/establecimientos/consulta";

describe("normalizarConsulta", () => {
  it("lowercases, strips accents and collapses spaces", () => {
    expect(normalizarConsulta("  HOSPITAL   Hipólito  Unanue ")).toBe("hospital hipolito unanue");
  });

  it.each([
    ["posta san borja", "puesto de salud san borja"],
    ["la posta de villa", "la puesto de salud de villa"],
    ["postas de comas", "puesto de salud de comas"],
    ["c.s. villa victoria", "centro de salud villa victoria"],
    ["cs comas", "centro de salud comas"],
    ["p.s. buena vista", "puesto de salud buena vista"],
    ["centros de salud de comas", "centro de salud de comas"],
  ])("speaks the padron's words: %j", (entrada, esperado) => {
    expect(normalizarConsulta(entrada)).toBe(esperado);
  });

  it("does not turn letters inside other words into synonyms", () => {
    expect(normalizarConsulta("hospital casos")).toBe("hospital casos");
    expect(normalizarConsulta("ipress psicologia")).toBe("ipress psicologia");
  });

  it("cuts a very long text", () => {
    expect(normalizarConsulta("a".repeat(500)).length).toBe(120);
  });

  it("an empty text stays empty", () => {
    expect(normalizarConsulta("   ")).toBe("");
  });

  it("searches with the text as written and with the synonyms expanded, because the padron mixes both forms", () => {
    expect(variantesConsulta("C.S. Santa María")).toEqual(["c.s. santa maria", "centro de salud santa maria"]);
    expect(variantesConsulta("Hospital Dos de Mayo")).toEqual(["hospital dos de mayo", "hospital dos de mayo"]);
  });
});
