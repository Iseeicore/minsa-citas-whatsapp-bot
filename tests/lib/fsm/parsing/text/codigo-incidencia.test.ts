import { describe, expect, it } from "vitest";
import { extractCodigoIncidencia, isConsultaKeyword, parseCodigoIncidencia } from "@/lib/fsm/parsing/text/codigo-incidencia";

describe("extractCodigoIncidencia", () => {
  it.each([
    ["MINSA-2026-000003", "MINSA-2026-000003"],
    ["minsa-2026-000003", "MINSA-2026-000003"],
    ["  MINSA-2026-000003  ", "MINSA-2026-000003"],
    ["quiero revisar mi incidencia MINSA-2026-000003.", "MINSA-2026-000003"],
    ["Hola, mi código es Minsa-2027-123456 gracias", "MINSA-2027-123456"],
  ])("reconoce el código completo en %j", (text, expected) => {
    expect(extractCodigoIncidencia(text)).toBe(expected);
  });

  it.each([
    "hola",
    "-0000",
    "MINSA-2026-0003",
    "MINSA-26-000003",
    "MINSA-2026-0000030",
    "XMINSA-2026-000003",
    "MINSA-2026-000003X",
    "MINSA 2026 000003",
    "MINSA-2026-000003-1",
  ])("no toma %j como un código", (text) => {
    expect(extractCodigoIncidencia(text)).toBeNull();
  });
});

describe("parseCodigoIncidencia", () => {
  it("acepta solo un código y tolera espacios alrededor", () => {
    expect(parseCodigoIncidencia("  minsa-2026-000003 ")).toBe("MINSA-2026-000003");
  });

  it("rechaza una frase que lo contiene", () => {
    expect(parseCodigoIncidencia("mi código MINSA-2026-000003")).toBeNull();
  });
});

describe("isConsultaKeyword", () => {
  it.each(["quiero consultar mi incidencia", "quiero ver el estado de mi incidencia", "seguimiento de mi reporte"])(
    "%j pide consultar",
    (text) => {
      expect(isConsultaKeyword(text)).toBe(true);
    },
  );

  it.each(["quiero registrar una incidencia", "quiero presentar una incidencia", "hola", "quiero ver mi cita"])(
    "%j no pide consultar",
    (text) => {
      expect(isConsultaKeyword(text)).toBe(false);
    },
  );
});
