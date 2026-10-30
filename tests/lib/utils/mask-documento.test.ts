import { describe, expect, it } from "vitest";
import { maskDocumento } from "@/lib/utils/mask-documento";

describe("maskDocumento", () => {
  it("deja a la vista solo los cuatro últimos dígitos de un DNI", () => {
    expect(maskDocumento("12347453")).toBe("****7453");
  });

  it("enmascara igual un carnet de extranjería de 9 dígitos", () => {
    expect(maskDocumento("123457453")).toBe("****7453");
  });

  it("ignora los separadores y deja solo los dígitos", () => {
    expect(maskDocumento("12.345.678")).toBe("****5678");
  });

  it("un valor de cuatro dígitos o menos no deja nada a la vista", () => {
    expect(maskDocumento("1234")).toBe("****");
    expect(maskDocumento("12")).toBe("****");
  });

  it("no vuelve a enmascarar lo ya enmascarado", () => {
    expect(maskDocumento("****5678")).toBe("****5678");
    expect(maskDocumento("****")).toBe("****");
  });
});
