import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const db = vi.hoisted(() => ({
  findUnique: vi.fn(async (): Promise<unknown> => null),
  upsert: vi.fn(async () => ({})),
  deleteMany: vi.fn(async () => ({ count: 0 })),
}));

vi.mock("@/lib/db/prisma", () => ({
  prisma: { sandboxSession: { findUnique: db.findUnique, upsert: db.upsert, deleteMany: db.deleteMany } },
}));

import {
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

    await saveSession(id, { state: "cita_awaiting_dni", slots: { citaDistrito: "ATE" }, counters: {} });

    await expect(sessionRowExists(id)).resolves.toBe(true);
    await expect(findSession(id)).resolves.toEqual({ state: "cita_awaiting_dni" });
    const read = await getSession(id);
    expect(read.state).toBe("cita_awaiting_dni");
    expect(read.updatedAt).toBeInstanceOf(Date);

    await resetSession(id);
    await expect(sessionRowExists(id)).resolves.toBe(false);
    await resetAllSandboxTestSessions();

    expect(db.findUnique).not.toHaveBeenCalled();
    expect(db.upsert).not.toHaveBeenCalled();
    expect(db.deleteMany).not.toHaveBeenCalled();
  });
});

describe("session store with the database (default)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("reads the SandboxSession row by id, exactly as before", async () => {
    db.findUnique.mockResolvedValueOnce({ id: "51999", state: "main_menu" });
    await expect(findSession("51999")).resolves.toEqual({ id: "51999", state: "main_menu" });
    expect(db.findUnique).toHaveBeenCalledWith({ where: { id: "51999" } });
  });

  it("writes through Prisma", async () => {
    await saveSession("51999", { state: "main_menu", slots: {}, counters: {} });
    expect(db.upsert).toHaveBeenCalledTimes(1);
  });
});
