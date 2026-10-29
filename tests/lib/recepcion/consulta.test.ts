import { beforeEach, describe, expect, it, vi } from "vitest";

const db = vi.hoisted(() => ({
  findFirst: vi.fn<(args: unknown) => Promise<unknown>>(async () => null),
  findMany: vi.fn<(args: unknown) => Promise<unknown>>(async () => []),
  enabled: true,
}));

vi.mock("@/lib/db/persistence", () => ({ isDatabaseEnabled: () => db.enabled }));
vi.mock("@/lib/db/prisma", () => ({ prisma: { incidenciaPaciente: { findFirst: db.findFirst, findMany: db.findMany } } }));

import { consultarIncidencia, listarIncidencias } from "@/lib/recepcion/consulta";
import { estadoLegible, fechaLegible } from "@/lib/recepcion/consulta-dto";

const CODIGO = "MINSA-2026-000003";
const fila = { codigo: CODIGO, fechaCreacion: new Date("2026-10-09T15:30:00.000Z"), estadoIncidencia: { codigo: "EN_GESTION" } };

describe("consultarIncidencia", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    db.enabled = true;
    db.findFirst.mockResolvedValue(null);
    db.findMany.mockResolvedValue([]);
  });

  it("WhatsApp: busca por el usuario dueño (su wa_id actual), sin borradas, y devuelve solo código, estado y fecha", async () => {
    db.findFirst.mockResolvedValue({ ...fila, descripcion: "no debe salir", dniReclamante: "12345678", nombreReclamante: "Ana" });

    const result = await consultarIncidencia(CODIGO, { canal: "whatsapp", waId: "bsuid-ana" });

    expect(result).toEqual({ status: "found", codigo: CODIGO, estado: "EN_GESTION", fechaRegistro: "2026-10-09T15:30:00.000Z" });
    expect(JSON.stringify(result)).not.toMatch(/no debe salir|12345678|Ana/);
    expect(db.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({ where: { codigo: CODIGO, activo: true, eliminadoEn: null, usuario: { waId: "bsuid-ana" } } }),
    );
  });

  it("web: exige el DNI verificado y excluye las anónimas", async () => {
    db.findFirst.mockResolvedValue(fila);

    await consultarIncidencia(CODIGO, { canal: "web", dni: "12345678" });

    expect(db.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({ where: { codigo: CODIGO, activo: true, eliminadoEn: null, esAnonimo: false, dniReclamante: "12345678" } }),
    );
  });

  it("inexistente, ajena o borrada dan el mismo resultado (una sola consulta, sin distinguir)", async () => {
    const ajena = await consultarIncidencia(CODIGO, { canal: "whatsapp", waId: "bsuid-beto" });
    const inexistente = await consultarIncidencia("MINSA-2026-999999", { canal: "whatsapp", waId: "bsuid-beto" });

    expect(ajena).toEqual({ status: "not_found" });
    expect(inexistente).toEqual(ajena);
    expect(db.findFirst).toHaveBeenCalledTimes(2);
  });

  it("un código con formato inválido no llega a la base", async () => {
    await expect(consultarIncidencia("MINSA-2026-3", { canal: "whatsapp", waId: "x" })).resolves.toEqual({ status: "not_found" });
    expect(db.findFirst).not.toHaveBeenCalled();
  });

  it.each(["MINSA-2026-A-000012", "MINSA-2026-1000000", "MINSA-2026-A-1000000"])("el código %s llega a la base", async (codigo) => {
    await consultarIncidencia(codigo, { canal: "whatsapp", waId: "x" });

    expect(db.findFirst).toHaveBeenCalledWith(expect.objectContaining({ where: expect.objectContaining({ codigo }) }));
  });

  it.each(["MINSA-2026-B-000012", "MINSA-2026-A-00012", "minsa-2026-a-000012"])("el código %s no llega a la base", async (codigo) => {
    await expect(consultarIncidencia(codigo, { canal: "whatsapp", waId: "x" })).resolves.toEqual({ status: "not_found" });
    expect(db.findFirst).not.toHaveBeenCalled();
  });

  it("base apagada: error (se avisa «inténtalo más tarde») y no consulta", async () => {
    db.enabled = false;

    await expect(consultarIncidencia(CODIGO, { canal: "whatsapp", waId: "x" })).resolves.toEqual({ status: "error" });
    expect(db.findFirst).not.toHaveBeenCalled();
  });

  it("base caída: error, sin propagar la excepción", async () => {
    db.findFirst.mockRejectedValue(new Error("connection refused"));

    await expect(consultarIncidencia(CODIGO, { canal: "whatsapp", waId: "x" })).resolves.toEqual({ status: "error" });
  });
});

describe("listarIncidencias", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    db.enabled = true;
    db.findMany.mockResolvedValue([]);
  });

  it("WhatsApp: busca todas las del usuario dueño, de la más reciente a la más antigua", async () => {
    db.findMany.mockResolvedValue([
      { ...fila, descripcion: "no debe salir" },
      { codigo: "MINSA-2026-000001", fechaCreacion: new Date("2026-01-01T00:00:00.000Z"), estadoIncidencia: { codigo: "RESUELTO" } },
    ]);

    const result = await listarIncidencias({ canal: "whatsapp", waId: "bsuid-ana" });

    expect(result).toEqual({
      status: "found",
      items: [
        { codigo: CODIGO, estado: "EN_GESTION", fechaRegistro: "2026-10-09T15:30:00.000Z" },
        { codigo: "MINSA-2026-000001", estado: "RESUELTO", fechaRegistro: "2026-01-01T00:00:00.000Z" },
      ],
    });
    expect(JSON.stringify(result)).not.toMatch(/no debe salir/);
    expect(db.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { activo: true, eliminadoEn: null, usuario: { waId: "bsuid-ana" } },
        orderBy: { fechaCreacion: "desc" },
      }),
    );
  });

  it("web: exige el DNI verificado y excluye las anónimas, igual que la consulta puntual", async () => {
    await listarIncidencias({ canal: "web", dni: "12345678" });

    expect(db.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { activo: true, eliminadoEn: null, esAnonimo: false, dniReclamante: "12345678" } }),
    );
  });

  it("sin incidencias: empty", async () => {
    await expect(listarIncidencias({ canal: "whatsapp", waId: "x" })).resolves.toEqual({ status: "empty" });
  });

  it("base apagada: error y no consulta", async () => {
    db.enabled = false;

    await expect(listarIncidencias({ canal: "whatsapp", waId: "x" })).resolves.toEqual({ status: "error" });
    expect(db.findMany).not.toHaveBeenCalled();
  });

  it("base caída: error, sin propagar la excepción", async () => {
    db.findMany.mockRejectedValue(new Error("connection refused"));

    await expect(listarIncidencias({ canal: "whatsapp", waId: "x" })).resolves.toEqual({ status: "error" });
  });
});

describe("estadoLegible y fechaLegible", () => {
  it.each([
    ["REGISTRADO", "Recibida, pendiente de revisión"],
    ["CLASIFICADO", "Recibida, pendiente de revisión"],
    ["DERIVADO", "Derivada al área responsable"],
    ["EN_GESTION", "En atención por el área responsable"],
    ["RESUELTO", "Resuelta"],
    ["ARCHIVADO", "Archivada"],
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
