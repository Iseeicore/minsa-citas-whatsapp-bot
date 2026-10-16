import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { CounterKey } from "@/lib/enums/counter-key";
import { SlotKey } from "@/lib/enums/slot-key";
import { CLOSED_SESSION_ID_PREFIX } from "@/lib/constants/session-ids";

const db = vi.hoisted(() => ({
  findUnique: vi.fn(async (): Promise<unknown> => null),
  upsert: vi.fn(async () => ({})),
  deleteMany: vi.fn(async () => ({ count: 0 })),
  updateMany: vi.fn(async () => ({ count: 1 })),
}));

vi.mock("@/lib/db/prisma", () => ({
  prisma: { sesionConversacion: { findUnique: db.findUnique, upsert: db.upsert, deleteMany: db.deleteMany, updateMany: db.updateMany } },
}));

import {
  closeSession,
  findSession,
  getSession,
  resetAllSandboxTestSessions,
  resetSession,
  saveSession,
  sessionRowExists,
} from "@/lib/fsm/session/session-store";

let counter = 0;
const freshId = () => `51900${++counter}`;

describe("session store with DATABASE_ENABLED=false", () => {
  beforeEach(() => {
    vi.stubEnv("DATABASE_ENABLED", "false");
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("keeps each citizen's session in memory and never touches the database", async () => {
    const id = freshId();
    await expect(sessionRowExists(id)).resolves.toBe(false);

    await saveSession(id, { state: "cita_awaiting_dni", slots: { [SlotKey.CITA_DISTRITO]: "ATE" }, counters: {} });

    await expect(sessionRowExists(id)).resolves.toBe(true);
    await expect(findSession(id)).resolves.toEqual({ state: "cita_awaiting_dni" });
    const read = await getSession(id);
    expect(read.state).toBe("cita_awaiting_dni");
    expect(read.updatedAt).toBeInstanceOf(Date);

    await resetSession(id);
    await expect(sessionRowExists(id)).resolves.toBe(false);
    await resetAllSandboxTestSessions();
    await closeSession(id);

    expect(db.findUnique).not.toHaveBeenCalled();
    expect(db.upsert).not.toHaveBeenCalled();
    expect(db.deleteMany).not.toHaveBeenCalled();
    expect(db.updateMany).not.toHaveBeenCalled();
  });

  it("closes a session in memory: the original id is free and the state is kept under a closed id", async () => {
    const id = freshId();
    await saveSession(id, { state: "cita_awaiting_dni", slots: { [SlotKey.CITA_DISTRITO]: "ATE" }, counters: {} });

    await closeSession(id);

    await expect(sessionRowExists(id)).resolves.toBe(false);
    await saveSession(id, { state: "main_menu", slots: {}, counters: {} });
    await expect(findSession(id)).resolves.toEqual({ state: "main_menu" });
  });
});

describe("session store with the database (default)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("reads the session row by waId and exposes its state", async () => {
    db.findUnique.mockResolvedValueOnce({ waId: "51999", estado: "main_menu" });
    await expect(findSession("51999")).resolves.toEqual({ state: "main_menu" });
    expect(db.findUnique).toHaveBeenCalledWith({ where: { waId: "51999" } });
  });

  it("maps the stored row to a Session, using the modification date as updatedAt", async () => {
    const fechaModificacion = new Date("2026-10-04T10:00:00Z");
    db.findUnique.mockResolvedValueOnce({
      waId: "51999",
      estado: "cita_awaiting_dni",
      slots: { [SlotKey.DESCRIPCION_INCIDENCIA]: "q" },
      contadores: { [CounterKey.CITA_HORA_PAGE]: 2 },
      fechaModificacion,
    });
    await expect(getSession("51999")).resolves.toEqual({
      state: "cita_awaiting_dni",
      slots: { [SlotKey.DESCRIPCION_INCIDENCIA]: "q" },
      counters: { [CounterKey.CITA_HORA_PAGE]: 2 },
      updatedAt: fechaModificacion,
    });
  });

  it("upserts by waId with the Spanish column names", async () => {
    await saveSession("51999", {
      state: "main_menu",
      slots: { [SlotKey.DESCRIPCION_INCIDENCIA]: "q" },
      counters: { [CounterKey.CITA_HORA_PAGE]: 2 },
    });
    expect(db.upsert).toHaveBeenCalledWith({
      where: { waId: "51999" },
      create: {
        waId: "51999",
        estado: "main_menu",
        slots: { [SlotKey.DESCRIPCION_INCIDENCIA]: "q" },
        contadores: { [CounterKey.CITA_HORA_PAGE]: 2 },
      },
      update: { estado: "main_menu", slots: { [SlotKey.DESCRIPCION_INCIDENCIA]: "q" }, contadores: { [CounterKey.CITA_HORA_PAGE]: 2 } },
    });
  });

  it("deletes by waId, and sandbox sessions by waId prefix", async () => {
    await resetSession("51999");
    expect(db.deleteMany).toHaveBeenCalledWith({ where: { waId: "51999" } });
    await resetAllSandboxTestSessions();
    expect(db.deleteMany).toHaveBeenCalledWith({ where: { waId: { startsWith: "sandbox-" } } });
  });

  it("closes by renaming the waId with the closed prefix and the close time, leaving everything else untouched", async () => {
    vi.spyOn(Date, "now").mockReturnValueOnce(1_760_000_000_000);

    await closeSession("sandbox-abc");

    expect(db.updateMany).toHaveBeenCalledWith({
      where: { waId: "sandbox-abc" },
      data: { waId: `${CLOSED_SESSION_ID_PREFIX}sandbox-abc-1760000000000` },
    });
    expect(db.deleteMany).not.toHaveBeenCalled();
  });

  it("closing a session that does not exist does not fail", async () => {
    db.updateMany.mockResolvedValueOnce({ count: 0 });

    await expect(closeSession("sandbox-missing")).resolves.toBeUndefined();
  });

  it("the closed prefix never matches the sandbox prefix, so reset-all does not delete closed sessions", async () => {
    expect(CLOSED_SESSION_ID_PREFIX.startsWith("sandbox-")).toBe(false);
    await resetAllSandboxTestSessions();
    expect(db.deleteMany).toHaveBeenCalledWith({ where: { waId: { startsWith: "sandbox-" } } });
  });

  it("writes through Prisma", async () => {
    await saveSession("51999", { state: "main_menu", slots: {}, counters: {} });
    expect(db.upsert).toHaveBeenCalledTimes(1);
  });
});
