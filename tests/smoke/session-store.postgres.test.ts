import { randomUUID } from "node:crypto";
import { afterAll, describe, expect, it } from "vitest";
import { prisma } from "@/lib/db/prisma";
import { CounterKey } from "@/lib/enums/counter-key";
import { SessionState } from "@/lib/enums/session-state";
import { SlotKey } from "@/lib/enums/slot-key";
import type { Session } from "@/lib/fsm/core/types";
import {
  findSession,
  getSession,
  resetAllSandboxTestSessions,
  resetSession,
  saveSession,
  sessionRowExists,
} from "@/lib/fsm/session/session-store";

const sleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));
const waId = () => `smoke-${randomUUID()}`;

describe.skipIf(!process.env.DATABASE_URL)("session store against a real PostgreSQL", () => {
  const created: string[] = [];

  afterAll(async () => {
    await prisma.sesionConversacion.deleteMany({ where: { waId: { in: created } } });
    await prisma.$disconnect();
  });

  it("saves, reads back and checks existence", async () => {
    const id = waId();
    created.push(id);
    await expect(sessionRowExists(id)).resolves.toBe(false);

    await saveSession(id, {
      state: SessionState.CITA_AWAITING_DNI,
      slots: { [SlotKey.QUEJA]: "texto" },
      counters: { [CounterKey.CITA_HORA_PAGE]: 2 },
    });

    await expect(sessionRowExists(id)).resolves.toBe(true);
    await expect(findSession(id)).resolves.toEqual({ state: SessionState.CITA_AWAITING_DNI });
    const read = await getSession(id);
    expect(read).toMatchObject({
      state: SessionState.CITA_AWAITING_DNI,
      slots: { [SlotKey.QUEJA]: "texto" },
      counters: { [CounterKey.CITA_HORA_PAGE]: 2 },
    });
    expect(read.updatedAt).toBeInstanceOf(Date);
  });

  it("renews the modification date on every save, even when nothing changed (the idle guard depends on it)", async () => {
    const id = waId();
    created.push(id);
    const session: Session = { state: SessionState.MAIN_MENU, slots: {}, counters: {} };

    await saveSession(id, session);
    const first = (await getSession(id)).updatedAt as Date;
    await sleep(30);
    await saveSession(id, session);
    const second = (await getSession(id)).updatedAt as Date;

    expect(second.getTime()).toBeGreaterThan(first.getTime());
  });

  it("deletes one session, and only the sandbox ones in bulk", async () => {
    const real = waId();
    const sandbox = `sandbox-${randomUUID()}`;
    created.push(real, sandbox);
    const session: Session = { state: SessionState.MAIN_MENU, slots: {}, counters: {} };
    await saveSession(real, session);
    await saveSession(sandbox, session);

    await resetAllSandboxTestSessions();
    await expect(sessionRowExists(sandbox)).resolves.toBe(false);
    await expect(sessionRowExists(real)).resolves.toBe(true);

    await resetSession(real);
    await expect(sessionRowExists(real)).resolves.toBe(false);
  });
});
