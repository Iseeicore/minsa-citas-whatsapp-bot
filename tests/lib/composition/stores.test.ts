import { afterEach, describe, expect, it, vi } from "vitest";

const db = vi.hoisted(() => ({
  findUnique: vi.fn<(args: unknown) => Promise<unknown>>(async () => null),
  upsert: vi.fn<(args: unknown) => Promise<unknown>>(async () => ({})),
  create: vi.fn<(args: unknown) => Promise<unknown>>(async () => ({})),
  findFirst: vi.fn<(args: unknown) => Promise<unknown>>(async () => null),
  createIntento: vi.fn<(args: unknown) => Promise<unknown>>(async () => ({})),
  queryRaw: vi.fn<(...args: unknown[]) => Promise<unknown>>(async () => [{ total: BigInt(0) }]),
}));

vi.mock("@/lib/db/prisma", () => ({
  prisma: {
    usuario: { findUnique: db.findUnique, upsert: db.upsert },
    aceptacionTerminos: { create: db.create, findFirst: db.findFirst },
    consultaIncidenciaIntento: { create: db.createIntento },
    $queryRaw: db.queryRaw,
  },
}));

import { getAceptacionTerminosStore, getConsentimientoStore, getCupoDiarioStore, getDniVerificadoStore } from "@/lib/composition/stores";
import { FlujoAceptacion } from "@/lib/enums/flujo-aceptacion";
import { ResultadoIntentoConsulta } from "@/lib/enums/resultado-intento-consulta";
import { SessionChannel } from "@/lib/enums/session-channel";

const ACEPTACION = { waId: "51999000111", canal: SessionChannel.WHATSAPP, version: "2026-10-29", flujo: FlujoAceptacion.CITA };
const INTENTO = { identificador: "sandbox-ana", canal: SessionChannel.WEB, resultado: ResultadoIntentoConsulta.ENCONTRADA };

afterEach(() => {
  vi.unstubAllEnvs();
  vi.clearAllMocks();
});

describe("composition of the stores", () => {
  it("with DATABASE_ENABLED=false hands out one memory store per process and never touches Prisma", async () => {
    vi.stubEnv("DATABASE_ENABLED", "false");

    await getConsentimientoStore().marcarAceptado("bsuid-memoria");
    await getAceptacionTerminosStore().save(ACEPTACION);
    await getCupoDiarioStore().save(INTENTO);
    await getDniVerificadoStore().save("bsuid-memoria", "12345678");

    await expect(getConsentimientoStore().tieneAceptado("bsuid-memoria")).resolves.toBe(true);
    await expect(getAceptacionTerminosStore().find(ACEPTACION.waId, ACEPTACION.version)).resolves.toEqual({ aceptadoEn: expect.any(Date) });
    await expect(getAceptacionTerminosStore().find(ACEPTACION.waId, "otra-version")).resolves.toBeUndefined();
    await expect(getCupoDiarioStore().countDelDia(INTENTO.identificador)).resolves.toBe(1);
    expect(getConsentimientoStore()).toBe(getConsentimientoStore());
    expect(getAceptacionTerminosStore()).toBe(getAceptacionTerminosStore());
    expect(getCupoDiarioStore()).toBe(getCupoDiarioStore());
    expect(getDniVerificadoStore()).toBe(getDniVerificadoStore());
    expect(db.findFirst).not.toHaveBeenCalled();
    expect(db.findUnique).not.toHaveBeenCalled();
    expect(db.upsert).not.toHaveBeenCalled();
    expect(db.create).not.toHaveBeenCalled();
    expect(db.createIntento).not.toHaveBeenCalled();
    expect(db.queryRaw).not.toHaveBeenCalled();
  });

  it("with the database on uses the Prisma stores", async () => {
    await getConsentimientoStore().tieneAceptado("bsuid-ana");
    await getAceptacionTerminosStore().save(ACEPTACION);
    await getCupoDiarioStore().save(INTENTO);
    await getCupoDiarioStore().countDelDia(INTENTO.identificador);
    await getAceptacionTerminosStore().find(ACEPTACION.waId, ACEPTACION.version);
    await getDniVerificadoStore().save("bsuid-ana", "12345678");

    expect(db.findUnique).toHaveBeenCalledOnce();
    expect(db.findFirst).toHaveBeenCalledOnce();
    expect(db.upsert).toHaveBeenCalledOnce();
    expect(db.create).toHaveBeenCalledOnce();
    expect(db.createIntento).toHaveBeenCalledOnce();
    expect(db.queryRaw).toHaveBeenCalledOnce();
  });
});
