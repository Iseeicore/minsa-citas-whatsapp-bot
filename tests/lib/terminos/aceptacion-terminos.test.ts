import { afterEach, describe, expect, it, vi } from "vitest";

const db = vi.hoisted(() => ({ create: vi.fn(), findFirst: vi.fn() }));

vi.mock("@/lib/db/prisma", () => ({
  prisma: { aceptacionTerminos: { create: db.create, findFirst: db.findFirst } },
}));

import {
  createMemoryAceptacionTerminosStore,
  createPrismaAceptacionTerminosStore,
  findAceptacionTerminos,
  saveAceptacionTerminos,
} from "@/lib/terminos/aceptacion-terminos";
import { AceptacionTerminosLookup } from "@/lib/enums/aceptacion-terminos-lookup";
import { FlujoAceptacion } from "@/lib/enums/flujo-aceptacion";
import type { AceptacionTerminos, AceptacionTerminosStore } from "@/lib/types/aceptacion-terminos.types";
import { AceptacionTerminosStatus } from "@/lib/enums/aceptacion-terminos-status";
import { CanalOrigenId } from "@/lib/enums/canal-origen-id";
import { SessionChannel } from "@/lib/enums/session-channel";
import { captureLogs } from "@/tests/support/capture-logs";

const ACEPTACION: AceptacionTerminos = {
  waId: "51999000111",
  canal: SessionChannel.WHATSAPP,
  version: "2026-10-29",
  flujo: FlujoAceptacion.CITA,
};

afterEach(() => {
  db.create.mockReset();
  db.findFirst.mockReset();
});

describe("saveAceptacionTerminos", () => {
  it("keeps the acceptance in the store it receives", async () => {
    const saved: AceptacionTerminos[] = [];
    const store: AceptacionTerminosStore = { save: async (aceptacion) => void saved.push(aceptacion), find: async () => undefined };

    const result = await saveAceptacionTerminos(ACEPTACION, store);

    expect(result).toEqual({ resultado: AceptacionTerminosStatus.SAVED });
    expect(saved).toEqual([ACEPTACION]);
  });

  it("does not break the conversation when the store fails: it logs the failure without the chat id and answers FAILED", async () => {
    const lines = captureLogs();
    const broken: AceptacionTerminosStore = { save: () => Promise.reject(new Error("conexion caida")), find: async () => undefined };

    const result = await saveAceptacionTerminos(ACEPTACION, broken);

    expect(result).toEqual({ resultado: AceptacionTerminosStatus.FAILED });
    expect(lines).toEqual([
      expect.objectContaining({ level: "error", event: "terminos.persist_failed", canal: SessionChannel.WHATSAPP, version: "2026-10-29" }),
    ]);
    expect(JSON.stringify(lines)).not.toContain(ACEPTACION.waId);
  });
});

describe("createPrismaAceptacionTerminosStore", () => {
  it.each([
    [SessionChannel.WHATSAPP, CanalOrigenId.WHATSAPP],
    [SessionChannel.WEB, CanalOrigenId.WEB],
  ])("saves the %s channel with its catalog id", async (canal, canalOrigenId) => {
    db.create.mockResolvedValue({});

    await createPrismaAceptacionTerminosStore().save({ ...ACEPTACION, canal });

    expect(db.create).toHaveBeenCalledWith({
      data: { waId: ACEPTACION.waId, canalOrigenId, version: ACEPTACION.version, flujo: FlujoAceptacion.CITA },
    });
  });

  it("looks for an acceptance of the chat and the version, of any service", async () => {
    db.findFirst.mockResolvedValueOnce({ aceptadoEn: new Date("2026-10-30T15:00:00Z") }).mockResolvedValueOnce(null);
    const store = createPrismaAceptacionTerminosStore();

    await expect(store.find(ACEPTACION.waId, ACEPTACION.version)).resolves.toEqual({ aceptadoEn: new Date("2026-10-30T15:00:00Z") });
    await expect(store.find(ACEPTACION.waId, "2027-01-01")).resolves.toBeUndefined();
    expect(db.findFirst).toHaveBeenCalledWith({
      where: { waId: ACEPTACION.waId, version: ACEPTACION.version },
      select: { aceptadoEn: true },
    });
  });
});

describe("findAceptacionTerminos", () => {
  it("answers FOUND for the accepted version and NOT_FOUND for a new one, whatever the service it was accepted in", async () => {
    const store = createMemoryAceptacionTerminosStore();
    await store.save({ ...ACEPTACION, flujo: FlujoAceptacion.DENUNCIA });

    await expect(findAceptacionTerminos(ACEPTACION.waId, ACEPTACION.version, store)).resolves.toEqual({
      resultado: AceptacionTerminosLookup.FOUND,
    });
    await expect(findAceptacionTerminos(ACEPTACION.waId, "2027-01-01", store)).resolves.toEqual({
      resultado: AceptacionTerminosLookup.NOT_FOUND,
    });
  });

  it("answers FAILED when the store fails and logs it without the chat id", async () => {
    const lines = captureLogs();
    const broken: AceptacionTerminosStore = { save: async () => undefined, find: () => Promise.reject(new Error("conexion caida")) };

    await expect(findAceptacionTerminos(ACEPTACION.waId, ACEPTACION.version, broken)).resolves.toEqual({
      resultado: AceptacionTerminosLookup.FAILED,
    });
    expect(lines).toEqual([expect.objectContaining({ level: "error", event: "terminos.lookup_failed", version: ACEPTACION.version })]);
    expect(JSON.stringify(lines)).not.toContain(ACEPTACION.waId);
  });
});
