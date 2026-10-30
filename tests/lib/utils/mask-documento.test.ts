import { describe, expect, it } from "vitest";
import { maskDocumento } from "@/lib/utils/mask-documento";

describe("maskDocumento", () => {
  it.each([
    ["deja a la vista solo los cuatro últimos dígitos de un DNI", "12347453", "****7453"],
    ["enmascara igual un carnet de extranjería de 9 dígitos", "123457453", "****7453"],
    ["ignora los separadores y deja solo los dígitos", "12.345.678", "****5678"],
    ["un valor de cuatro dígitos no deja nada a la vista", "1234", "****"],
    ["un valor de menos de cuatro dígitos no deja nada a la vista", "12", "****"],
    ["no vuelve a enmascarar lo ya enmascarado", "****5678", "****5678"],
    ["no vuelve a enmascarar una máscara vacía", "****", "****"],
  ])("%s", (_caso, documento, esperado) => {
    expect(maskDocumento(documento)).toBe(esperado);
  });
});
