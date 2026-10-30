import { beforeEach, describe, expect, it, vi } from "vitest";

const db = vi.hoisted(() => ({
  findFirst: vi.fn<(args: unknown) => Promise<unknown>>(async () => null),
  enabled: true,
}));

vi.mock("@/lib/db/persistence", () => ({ isDatabaseEnabled: () => db.enabled }));
vi.mock("@/lib/db/prisma", () => ({ prisma: { incidenciaPaciente: { findFirst: db.findFirst } } }));

import { consultarIncidencia } from "@/lib/recepcion/consulta";
import { estadoLegible, fechaLegible } from "@/lib/recepcion/consulta-dto";
import type { CupoDiarioStore, IntentoConsulta } from "@/lib/types/cupo-diario.types";
import { ResultadoIntentoConsulta } from "@/lib/enums/resultado-intento-consulta";
import { SessionChannel } from "@/lib/enums/session-channel";

const CODIGO = "MINSA-2026-000003";
const ANONIMA = { codigo: "MINSA-2026-A-000003", establecimientoId: 7, esAnonimo: true as const };
const CON_DNI = { codigo: CODIGO, establecimientoId: 7, esAnonimo: false as const, dni: "12345678" };
const QUIEN = { identificador: "bsuid-ana", canal: SessionChannel.WHATSAPP };
const fila = { codigo: CODIGO, fechaCreacion: new Date("2026-10-09T15:30:00.000Z"), estadoIncidencia: { codigo: "EN_GESTION" } };

function cupo(save: (intento: IntentoConsulta) => Promise<void> = async () => undefined) {
  const saved: IntentoConsulta[] = [];
  const store: CupoDiarioStore = {
    save: async (intento) => {
      await save(intento);
      saved.push(intento);
    },
    countDelDia: async () => 0,
  };
  return { store, saved };
}

describe("consultarIncidencia", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    db.enabled = true;
    db.findFirst.mockResolvedValue(null);
  });

  it("anónima: busca por código y establecimiento, solo entre las anónimas, y devuelve solo código, estado y fecha", async () => {
    db.findFirst.mockResolvedValue({ ...fila, descripcion: "no debe salir", dniReclamante: "12345678" });
    const { store, saved } = cupo();

    const result = await consultarIncidencia(ANONIMA, QUIEN, store);

    expect(result).toEqual({ status: "found", codigo: CODIGO, estado: "EN_GESTION", fechaRegistro: "2026-10-09T15:30:00.000Z" });
    expect(JSON.stringify(result)).not.toMatch(/no debe salir|12345678/);
    expect(db.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { codigo: ANONIMA.codigo, establecimientoId: 7, esAnonimo: true, activo: true, eliminadoEn: null },
      }),
    );
    expect(saved).toEqual([{ ...QUIEN, resultado: ResultadoIntentoConsulta.ENCONTRADA }]);
  });

  it("con DNI: exige el DNI con el que se registró", async () => {
    await consultarIncidencia(CON_DNI, QUIEN, cupo().store);

    expect(db.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { codigo: CODIGO, establecimientoId: 7, esAnonimo: false, dniReclamante: "12345678", activo: true, eliminadoEn: null },
      }),
    );
  });

  it("no encontrada: cuenta como consulta del día", async () => {
    const { store, saved } = cupo();

    await expect(consultarIncidencia(CON_DNI, QUIEN, store)).resolves.toEqual({ status: "not_found" });
    expect(saved.map((intento) => intento.resultado)).toEqual([ResultadoIntentoConsulta.NO_ENCONTRADA]);
  });

  it("un código con formato inválido no llega a la base, pero cuenta", async () => {
    const { store, saved } = cupo();

    await expect(consultarIncidencia({ ...CON_DNI, codigo: "MINSA-2026-3" }, QUIEN, store)).resolves.toEqual({ status: "not_found" });
    expect(db.findFirst).not.toHaveBeenCalled();
    expect(saved).toHaveLength(1);
  });

  it.each([
    ["base apagada", () => (db.enabled = false)],
    ["base caída", () => db.findFirst.mockRejectedValue(new Error("connection refused"))],
  ])("%s: error, sin propagar la excepción, y también cuenta", async (_caso, romper) => {
    romper();
    const { store, saved } = cupo();

    await expect(consultarIncidencia(ANONIMA, QUIEN, store)).resolves.toEqual({ status: "error" });
    expect(saved.map((intento) => intento.resultado)).toEqual([ResultadoIntentoConsulta.ERROR]);
  });

  it("si la consulta no se pudo registrar en el cupo, no muestra el resultado: error", async () => {
    db.findFirst.mockResolvedValue(fila);
    const { store } = cupo(async () => {
      throw new Error("insert failed");
    });

    await expect(consultarIncidencia(CON_DNI, QUIEN, store)).resolves.toEqual({ status: "error" });
  });
});

describe("estadoLegible y fechaLegible", () => {
  it.each([
    ["REGISTRADO", "Registrada"],
    ["CLASIFICADO", "Registrada"],
    ["DERIVADO", "En proceso"],
    ["EN_GESTION", "En proceso"],
    ["RESUELTO", "Resuelta"],
    ["ARCHIVADO", "Cerrada"],
    ["ANULADO", "Cerrada"],
    ["OTRO_NUEVO", "En proceso"],
  ])("%s se muestra como «%s»", (codigo, esperado) => {
    expect(estadoLegible(codigo)).toBe(esperado);
  });

  it("la fecha sale en hora de Lima como dd/mm/aaaa", () => {
    expect(fechaLegible("2026-10-10T03:30:00.000Z")).toBe("09/10/2026");
    expect(fechaLegible("no es una fecha")).toBe("");
  });
});
