import { afterEach, describe, expect, it, vi } from "vitest";

const db = vi.hoisted(() => ({ create: vi.fn() }));

vi.mock("@/lib/db/prisma", () => ({
  prisma: { aceptacionTerminos: { create: db.create } },
}));

import {
  createMemoryAceptacionTerminosStore,
  createPrismaAceptacionTerminosStore,
  saveAceptacionTerminos,
  type AceptacionTerminos,
  type AceptacionTerminosStore,
} from "@/lib/terminos/aceptacion-terminos";
import { configureLogger } from "@/lib/observability/logger";
import { AceptacionTerminosStatus } from "@/lib/enums/aceptacion-terminos-status";
import { CanalOrigenId } from "@/lib/enums/canal-origen-id";
import { SessionChannel } from "@/lib/enums/session-channel";

const ACEPTACION: AceptacionTerminos = { waId: "51999000111", canal: SessionChannel.WHATSAPP, version: "2026-10-29" };

let restoreLogger: (() => void) | undefined;

afterEach(() => {
  restoreLogger?.();
  restoreLogger = undefined;
  db.create.mockReset();
});

describe("saveAceptacionTerminos", () => {
  it("keeps the acceptance in the store it receives", async () => {
    const saved: AceptacionTerminos[] = [];
    const store: AceptacionTerminosStore = { save: async (aceptacion) => void saved.push(aceptacion) };

    const result = await saveAceptacionTerminos(ACEPTACION, store);

    expect(result).toEqual({ resultado: AceptacionTerminosStatus.SAVED });
    expect(saved).toEqual([ACEPTACION]);
  });

  it("does not break the conversation when the store fails: it logs the failure without the chat id and answers FAILED", async () => {
    const lines: Array<Record<string, unknown>> = [];
    restoreLogger = configureLogger({ sink: (_level, line) => lines.push(JSON.parse(line)), level: "info" });
    const broken: AceptacionTerminosStore = { save: () => Promise.reject(new Error("conexion caida")) };

    const result = await saveAceptacionTerminos(ACEPTACION, broken);

    expect(result).toEqual({ resultado: AceptacionTerminosStatus.FAILED });
    expect(lines).toEqual([
      expect.objectContaining({ level: "error", event: "terminos.persist_failed", canal: SessionChannel.WHATSAPP, version: "2026-10-29" }),
    ]);
    expect(JSON.stringify(lines)).not.toContain(ACEPTACION.waId);
  });

  it("saves in memory without touching Prisma", async () => {
    const result = await saveAceptacionTerminos(ACEPTACION, createMemoryAceptacionTerminosStore());

    expect(result).toEqual({ resultado: AceptacionTerminosStatus.SAVED });
    expect(db.create).not.toHaveBeenCalled();
  });

  it("saves in the database through the Prisma store", async () => {
    db.create.mockResolvedValue({});

    const result = await saveAceptacionTerminos({ ...ACEPTACION, canal: SessionChannel.WEB }, createPrismaAceptacionTerminosStore());

    expect(result).toEqual({ resultado: AceptacionTerminosStatus.SAVED });
    expect(db.create).toHaveBeenCalledOnce();
  });
});

describe("createPrismaAceptacionTerminosStore", () => {
  it.each([
    [SessionChannel.WHATSAPP, CanalOrigenId.WHATSAPP],
    [SessionChannel.WEB, CanalOrigenId.WEB],
  ])("saves the %s channel with its catalog id", async (canal, canalOrigenId) => {
    db.create.mockResolvedValue({});

    await createPrismaAceptacionTerminosStore().save({ ...ACEPTACION, canal });

    expect(db.create).toHaveBeenCalledWith({ data: { waId: ACEPTACION.waId, canalOrigenId, version: ACEPTACION.version } });
  });
});
