import { prisma } from "@/lib/db/prisma";
import { isDatabaseEnabled } from "@/lib/db/persistence";
import type { Session } from "@/lib/fsm/core/types";
import { createMemorySessionStore } from "@/lib/fsm/session/memory-session-store";

const memory = createMemorySessionStore();

function defaultSession(): Session {
  return { state: "main_menu", slots: {}, counters: {} };
}

export async function getSession(from: string): Promise<Session> {
  if (!isDatabaseEnabled()) return memory.getSession(from);

  const row = await prisma.sandboxSession.findUnique({ where: { id: from } });
  if (!row) return defaultSession();

  return {
    state: row.state,
    slots: row.slots as Session["slots"],
    counters: row.counters as Session["counters"],
    updatedAt: row.updatedAt,
  };
}

export async function findSession(from: string): Promise<{ state: string } | null> {
  if (!isDatabaseEnabled()) return memory.findSession(from);
  return prisma.sandboxSession.findUnique({ where: { id: from } });
}

export async function sessionRowExists(from: string): Promise<boolean> {
  if (!isDatabaseEnabled()) return memory.sessionRowExists(from);

  const row = await prisma.sandboxSession.findUnique({ where: { id: from }, select: { id: true } });
  return row !== null;
}

export async function saveSession(from: string, session: Session): Promise<void> {
  if (!isDatabaseEnabled()) return memory.saveSession(from, session);

  await prisma.sandboxSession.upsert({
    where: { id: from },
    create: {
      id: from,
      state: session.state,
      slots: session.slots,
      counters: session.counters,
    },
    update: {
      state: session.state,
      slots: session.slots,
      counters: session.counters,
    },
  });
}

export async function resetSession(from: string): Promise<void> {
  if (!isDatabaseEnabled()) return memory.resetSession(from);

  await prisma.sandboxSession.deleteMany({ where: { id: from } });
}

const SANDBOX_SESSION_ID_PREFIX = "sandbox-";

export async function resetAllSandboxTestSessions(): Promise<void> {
  if (!isDatabaseEnabled()) return memory.resetAllSandboxTestSessions();

  await prisma.sandboxSession.deleteMany({
    where: { id: { startsWith: SANDBOX_SESSION_ID_PREFIX } },
  });
}
