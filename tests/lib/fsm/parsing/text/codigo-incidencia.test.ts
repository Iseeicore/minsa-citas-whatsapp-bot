import { describe, expect, it } from "vitest";
import { extractCodigoIncidencia, isConsultaKeyword, parseCodigoIncidencia } from "@/lib/fsm/parsing/text/codigo-incidencia";

describe("extractCodigoIncidencia", () => {
  it.each([
    ["MINSA-2026-000003", "MINSA-2026-000003"],
    ["minsa-2026-000003", "MINSA-2026-000003"],
    ["  MINSA-2026-000003  ", "MINSA-2026-000003"],
    ["quiero revisar mi incidencia MINSA-2026-000003.", "MINSA-2026-000003"],
    ["Hola, mi código es Minsa-2027-123456 gracias", "MINSA-2027-123456"],
    ["MINSA-2026-A-000012", "MINSA-2026-A-000012"],
    ["mi denuncia anónima es minsa-2026-a-000012.", "MINSA-2026-A-000012"],
    ["MINSA-2026-1000000", "MINSA-2026-1000000"],
    ["el código MINSA-2026-A-1000000 por favor", "MINSA-2026-A-1000000"],
  ])("reconoce el código completo en %j", (text, expected) => {
    expect(extractCodigoIncidencia(text)).toBe(expected);
  });

  it.each([
    "hola",
    "-0000",
    "MINSA-2026-0003",
    "MINSA-26-000003",
    "MINSA-2026-A-00012",
    "MINSA-2026-B-000012",
    "MINSA-2026-A000012",
    "MINSA-2026-AA-000012",
    "MINSA-2026-A-",
    "XMINSA-2026-000003",
    "MINSA-2026-000003X",
    "MINSA 2026 000003",
    "MINSA-2026-000003-1",
  ])("no toma %j como un código", (text) => {
    expect(extractCodigoIncidencia(text)).toBeUndefined();
  });
});

describe("parseCodigoIncidencia", () => {
  it("acepta solo un código y tolera espacios alrededor", () => {
    expect(parseCodigoIncidencia("  minsa-2026-000003 ")).toBe("MINSA-2026-000003");
  });

  it("acepta el código anónimo y el de más de seis dígitos", () => {
    expect(parseCodigoIncidencia(" minsa-2026-a-000012 ")).toBe("MINSA-2026-A-000012");
    expect(parseCodigoIncidencia("MINSA-2026-1000000")).toBe("MINSA-2026-1000000");
  });

  it("rechaza una serie distinta de la anónima", () => {
    expect(parseCodigoIncidencia("MINSA-2026-B-000012")).toBeUndefined();
  });

  it("rechaza una frase que lo contiene", () => {
    expect(parseCodigoIncidencia("mi código MINSA-2026-000003")).toBeUndefined();
  });
});

describe("isConsultaKeyword", () => {
  it.each([
    "quiero consultar mi incidencia",
    "quiero ver el estado de mi incidencia",
    "seguimiento de mi reporte",
    "consultar mi denuncia",
    "ver mis denuncias",
    "quiero ver el estado de la denuncia que hice",
  ])("%j pide consultar", (text) => {
    expect(isConsultaKeyword(text)).toBe(true);
  });

  it.each([
    "quiero registrar una incidencia",
    "quiero presentar una incidencia",
    "hola",
    "quiero ver mi cita",
    "quiero presentar una denuncia anticorrupción",
    "quiero saber cómo hacer una denuncia",
    "quiero saber como poner una denuncia",
    "quiero saber cómo formular una denuncia",
    "quiero saber cómo interponer una denuncia",
  ])("%j no pide consultar", (text) => {
    expect(isConsultaKeyword(text)).toBe(false);
  });
});
