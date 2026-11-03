import { afterEach, describe, expect, it, vi } from "vitest";

const db = vi.hoisted(() => ({ createMany: vi.fn(), findMany: vi.fn() }));

vi.mock("@/lib/db/prisma", () => ({
  prisma: { aceptacionTerminos: { createMany: db.createMany, findMany: db.findMany } },
}));

import {
  createMemoryAceptacionTerminosStore,
  createPrismaAceptacionTerminosStore,
  findAceptacionTerminos,
  saveAceptacionTerminos,
} from "@/lib/terminos/aceptacion-terminos";
import { AceptacionTerminosLookup } from "@/lib/enums/consentimiento/aceptacion-terminos-lookup";
import { DocumentoAceptacion } from "@/lib/enums/consentimiento/documento-aceptacion";
import { FlujoAceptacion } from "@/lib/enums/consentimiento/flujo-aceptacion";
import type { AceptacionTerminos, AceptacionTerminosStore } from "@/lib/types/aceptacion-terminos.types";
import { AceptacionTerminosStatus } from "@/lib/enums/aceptacion-terminos-status";
import { CanalOrigenId } from "@/lib/enums/canal-origen-id";
import { SessionChannel } from "@/lib/enums/session-channel";
import { captureLogs } from "@/tests/support/capture-logs";

const TERMINOS = { documento: DocumentoAceptacion.TERMINOS, version: "2026-10-29" };
const DATOS_PERSONALES = { documento: DocumentoAceptacion.DATOS_PERSONALES, version: "2026-11-01" };

const ACEPTACION: AceptacionTerminos = {
  waId: "51999000111",
  canal: SessionChannel.WHATSAPP,
  flujo: FlujoAceptacion.CITA,
  documentos: [TERMINOS, DATOS_PERSONALES],
};

const CONSULTA = { waId: ACEPTACION.waId, flujo: ACEPTACION.flujo, documentos: ACEPTACION.documentos };

afterEach(() => {
  db.createMany.mockReset();
  db.findMany.mockReset();
});

describe("saveAceptacionTerminos", () => {
  it("keeps the acceptance in the store it receives", async () => {
    const saved: AceptacionTerminos[] = [];
    const store: AceptacionTerminosStore = { save: async (aceptacion) => void saved.push(aceptacion), findAceptados: async () => [] };

    const result = await saveAceptacionTerminos(ACEPTACION, store);

    expect(result).toEqual({ resultado: AceptacionTerminosStatus.SAVED });
    expect(saved).toEqual([ACEPTACION]);
  });

  it("does not break the conversation when the store fails: it logs the failure without the chat id and answers FAILED", async () => {
    const lines = captureLogs();
    const broken: AceptacionTerminosStore = { save: () => Promise.reject(new Error("conexion caida")), findAceptados: async () => [] };

    const result = await saveAceptacionTerminos(ACEPTACION, broken);

    expect(result).toEqual({ resultado: AceptacionTerminosStatus.FAILED });
    expect(lines).toEqual([
      expect.objectContaining({
        level: "error",
        event: "terminos.persist_failed",
        canal: SessionChannel.WHATSAPP,
        flujo: FlujoAceptacion.CITA,
      }),
    ]);
    expect(JSON.stringify(lines)).not.toContain(ACEPTACION.waId);
  });
});

describe("createPrismaAceptacionTerminosStore", () => {
  it("saves one row per document, each with its version, in a single insert with the channel catalog id", async () => {
    db.createMany.mockResolvedValue({ count: 2 });

    await createPrismaAceptacionTerminosStore().save({ ...ACEPTACION, canal: SessionChannel.WEB });

    expect(db.createMany).toHaveBeenCalledOnce();
    expect(db.createMany).toHaveBeenCalledWith({
      data: [
        { waId: ACEPTACION.waId, canalOrigenId: CanalOrigenId.WEB, flujo: FlujoAceptacion.CITA, ...TERMINOS },
        { waId: ACEPTACION.waId, canalOrigenId: CanalOrigenId.WEB, flujo: FlujoAceptacion.CITA, ...DATOS_PERSONALES },
      ],
    });
  });

  it("looks for the chat, the service and each document at its version, and answers the accepted documents", async () => {
    db.findMany.mockResolvedValue([{ documento: DocumentoAceptacion.TERMINOS }]);

    await expect(createPrismaAceptacionTerminosStore().findAceptados(CONSULTA)).resolves.toEqual([DocumentoAceptacion.TERMINOS]);
    expect(db.findMany).toHaveBeenCalledWith({
      where: { waId: ACEPTACION.waId, flujo: FlujoAceptacion.CITA, OR: [TERMINOS, DATOS_PERSONALES] },
      select: { documento: true },
    });
  });
});

describe("findAceptacionTerminos", () => {
  it("answers FOUND only when every document was accepted at its current version in the same service", async () => {
    const store = createMemoryAceptacionTerminosStore();
    await store.save(ACEPTACION);
    await store.save({ ...ACEPTACION, waId: "otro", flujo: FlujoAceptacion.DENUNCIA });

    await expect(findAceptacionTerminos(CONSULTA, store)).resolves.toEqual({ resultado: AceptacionTerminosLookup.FOUND });
    await expect(findAceptacionTerminos({ ...CONSULTA, waId: "otro" }, store)).resolves.toEqual({
      resultado: AceptacionTerminosLookup.NOT_FOUND,
    });
  });

  it("answers NOT_FOUND when a document changed its version or was never accepted", async () => {
    const store = createMemoryAceptacionTerminosStore();
    await store.save({ ...ACEPTACION, documentos: [TERMINOS] });

    await expect(findAceptacionTerminos(CONSULTA, store)).resolves.toEqual({ resultado: AceptacionTerminosLookup.NOT_FOUND });
    await expect(findAceptacionTerminos({ ...CONSULTA, documentos: [{ ...TERMINOS, version: "2027-01-01" }] }, store)).resolves.toEqual({
      resultado: AceptacionTerminosLookup.NOT_FOUND,
    });
  });

  it("answers FAILED when the store fails and logs it without the chat id", async () => {
    const lines = captureLogs();
    const broken: AceptacionTerminosStore = {
      save: async () => undefined,
      findAceptados: () => Promise.reject(new Error("conexion caida")),
    };

    await expect(findAceptacionTerminos(CONSULTA, broken)).resolves.toEqual({ resultado: AceptacionTerminosLookup.FAILED });
    expect(lines).toEqual([expect.objectContaining({ level: "error", event: "terminos.lookup_failed", flujo: FlujoAceptacion.CITA })]);
    expect(JSON.stringify(lines)).not.toContain(ACEPTACION.waId);
  });
});
