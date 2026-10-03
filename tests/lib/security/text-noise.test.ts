import { describe, expect, it } from "vitest";
import { looksLikeNoise } from "@/lib/security/text-noise";

describe("looksLikeNoise", () => {
  it("el string real reportado (solo dígitos y símbolos) es ruido", () => {
    expect(looksLikeNoise('12213133123}231333!#"!#!#!"$#"!#%$%"$#')).toBe(true);
  });

  it("mensajes normales en español, con o sin dígitos sueltos, no son ruido", () => {
    expect(looksLikeNoise("Hola, quiero una cita")).toBe(false);
    expect(looksLikeNoise("mi DNI es 45781239")).toBe(false);
    expect(looksLikeNoise("son las 8.45 am")).toBe(false);
    expect(looksLikeNoise("ayuda por favor")).toBe(false);
  });

  it("un DNI solo (todo dígitos, sin letras) sí cuenta como ruido por esta heurística", () => {
    expect(looksLikeNoise("12345678")).toBe(true);
  });

  it("vacío o solo espacios no es ruido (no hay nada que juzgar)", () => {
    expect(looksLikeNoise("")).toBe(false);
    expect(looksLikeNoise("   ")).toBe(false);
  });
});
