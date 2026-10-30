import { afterEach, describe, expect, it, vi } from "vitest";

const db = vi.hoisted(() => ({
  findUnique: vi.fn<(args: unknown) => Promise<unknown>>(async () => null),
  upsert: vi.fn<(args: unknown) => Promise<unknown>>(async () => ({})),
  create: vi.fn<(args: unknown) => Promise<unknown>>(async () => ({})),
}));

vi.mock("@/lib/db/prisma", () => ({
  prisma: { usuario: { findUnique: db.findUnique, upsert: db.upsert }, aceptacionTerminos: { create: db.create } },
}));

import { getAceptacionTerminosStore, getConsentimientoStore } from "@/lib/composition/stores";
import { SessionChannel } from "@/lib/enums/session-channel";

const ACEPTACION = { waId: "51999000111", canal: SessionChannel.WHATSAPP, version: "2026-10-29" };

afterEach(() => {
  vi.unstubAllEnvs();
  vi.clearAllMocks();
});

describe("composition of the stores", () => {
  it("with DATABASE_ENABLED=false hands out one memory store per process and never touches Prisma", async () => {
    vi.stubEnv("DATABASE_ENABLED", "false");

    await getConsentimientoStore().marcarAceptado("bsuid-memoria");
    await getAceptacionTerminosStore().save(ACEPTACION);

    await expect(getConsentimientoStore().tieneAceptado("bsuid-memoria")).resolves.toBe(true);
    expect(getConsentimientoStore()).toBe(getConsentimientoStore());
    expect(getAceptacionTerminosStore()).toBe(getAceptacionTerminosStore());
    expect(db.findUnique).not.toHaveBeenCalled();
    expect(db.upsert).not.toHaveBeenCalled();
    expect(db.create).not.toHaveBeenCalled();
  });

  it("with the database on uses the Prisma stores", async () => {
    await getConsentimientoStore().tieneAceptado("bsuid-ana");
    await getAceptacionTerminosStore().save(ACEPTACION);

    expect(db.findUnique).toHaveBeenCalledOnce();
    expect(db.create).toHaveBeenCalledOnce();
  });
});
