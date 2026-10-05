import { prisma } from "@/lib/db/prisma";
import { isDatabaseEnabled } from "@/lib/db/persistence";
import type { Session } from "@/lib/fsm/core/types";
import { createMemorySessionStore } from "@/lib/fsm/session/memory-session-store";
import { SessionState } from "@/lib/enums/session-state";

const memory = createMemorySessionStore();

function defaultSession(): Session {
  return { state: SessionState.MAIN_MENU, slots: {}, counters: {} };
}

export async function getSession(from: string): Promise<Session> {
  if (!isDatabaseEnabled()) return memory.getSession(from);

  const row = await prisma.sesionConversacion.findUnique({ where: { waId: from } });
  if (!row) return defaultSession();

  return {
    // Frontera de persistencia: la BD guarda texto libre; un estado desconocido se trata igual que antes (handle lanza).
    state: row.estado as Session["state"],
    slots: row.slots as Session["slots"],
    counters: row.contadores as Session["counters"],
    updatedAt: row.fechaModificacion,
  };
}

export async function findSession(from: string): Promise<{ state: string } | null> {
  if (!isDatabaseEnabled()) return memory.findSession(from);
  const row = await prisma.sesionConversacion.findUnique({ where: { waId: from } });
  return row ? { state: row.estado } : null;
}

export async function sessionRowExists(from: string): Promise<boolean> {
  if (!isDatabaseEnabled()) return memory.sessionRowExists(from);

  const row = await prisma.sesionConversacion.findUnique({ where: { waId: from }, select: { id: true } });
  return row !== null;
}

export async function saveSession(from: string, session: Session): Promise<void> {
  if (!isDatabaseEnabled()) return memory.saveSession(from, session);

  await prisma.sesionConversacion.upsert({
    where: { waId: from },
    create: {
      waId: from,
      estado: session.state,
      slots: session.slots,
      contadores: session.counters,
    },
    update: {
      estado: session.state,
      slots: session.slots,
      contadores: session.counters,
    },
  });
}

export async function resetSession(from: string): Promise<void> {
  if (!isDatabaseEnabled()) return memory.resetSession(from);

  await prisma.sesionConversacion.deleteMany({ where: { waId: from } });
}

const SANDBOX_SESSION_ID_PREFIX = "sandbox-";

export async function resetAllSandboxTestSessions(): Promise<void> {
  if (!isDatabaseEnabled()) return memory.resetAllSandboxTestSessions();

  await prisma.sesionConversacion.deleteMany({
    where: { waId: { startsWith: SANDBOX_SESSION_ID_PREFIX } },
  });
}
