import { describe, expect, it } from "vitest";
import { parseEstablecimientoQuery, toEstablecimientoResolucion } from "@/lib/fsm/flows/shared/establecimiento-resolver";
import type { BuscarEstablecimientoResult } from "@/lib/establecimientos/buscar";
import { EstablecimientoResolucion } from "@/lib/enums/establecimiento-resolucion";
import { EstablecimientoSearchBy } from "@/lib/enums/establecimiento-search-by";
import { EstablecimientoSearchStatus } from "@/lib/enums/establecimiento-search-status";

const HOSPITAL = { id: 7, areaId: 1, codigoRenipress: "5946", nombre: "Hospital Nacional Hipólito Unanue", distrito: "El Agustino" };
const candidato = (nombre: string, similitud: number) => ({ ...HOSPITAL, nombre, similitud, similitudPalabra: 0 });

describe("parseEstablecimientoQuery", () => {
  it.each([
    ["5946", { codigo: "5946" }],
    ["código IPRESS 005946", { codigo: "5946" }],
    ["Hospital Hipólito Unanue", { nombre: "Hospital Hipólito Unanue" }],
  ])("lee %j como %j", (text, expected) => {
    expect(parseEstablecimientoQuery(text)).toEqual(expected);
  });

  it("un texto sin letras ni código no es una búsqueda", () => {
    expect(parseEstablecimientoQuery("??? !!! ...")).toBeUndefined();
  });
});

describe("toEstablecimientoResolucion", () => {
  it.each<[string, BuscarEstablecimientoResult, unknown]>([
    [
      "código encontrado",
      { by: EstablecimientoSearchBy.CODIGO, status: EstablecimientoSearchStatus.FOUND, establecimiento: HOSPITAL },
      { kind: EstablecimientoResolucion.UNO, establecimiento: HOSPITAL },
    ],
    [
      "código inexistente",
      { by: EstablecimientoSearchBy.CODIGO, status: EstablecimientoSearchStatus.NOT_FOUND },
      { kind: EstablecimientoResolucion.NINGUNO, by: EstablecimientoSearchBy.CODIGO },
    ],
    [
      "nombre sin candidatos",
      { by: EstablecimientoSearchBy.NOMBRE, status: EstablecimientoSearchStatus.OK, candidatos: [] },
      { kind: EstablecimientoResolucion.NINGUNO, by: EstablecimientoSearchBy.NOMBRE },
    ],
    [
      "nombre con varios parecidos",
      {
        by: EstablecimientoSearchBy.NOMBRE,
        status: EstablecimientoSearchStatus.OK,
        candidatos: [candidato("Hospital A", 0.5), candidato("Hospital B", 0.45)],
      },
      { kind: EstablecimientoResolucion.VARIOS },
    ],
    [
      "base caída",
      { by: EstablecimientoSearchBy.NOMBRE, status: EstablecimientoSearchStatus.UNAVAILABLE },
      { kind: EstablecimientoResolucion.NO_DISPONIBLE },
    ],
  ])("%s", (_caso, result, expected) => {
    expect(toEstablecimientoResolucion(result)).toEqual(expected);
  });

  it("nombre con un candidato claro: uno", () => {
    const result = toEstablecimientoResolucion({
      by: EstablecimientoSearchBy.NOMBRE,
      status: EstablecimientoSearchStatus.OK,
      candidatos: [candidato(HOSPITAL.nombre, 0.9)],
    });

    expect(result).toMatchObject({ kind: EstablecimientoResolucion.UNO, establecimiento: { id: 7, nombre: HOSPITAL.nombre } });
  });
});
