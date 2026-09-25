import { prisma } from "@/lib/db/prisma";
import type { Session } from "@/lib/fsm/core/types";

function defaultSession(): Session {
  return { state: "main_menu", slots: {}, counters: {} };
}

export async function getSession(from: string): Promise<Session> {
  const row = await prisma.sandboxSession.findUnique({ where: { id: from } });
  if (!row) return defaultSession();

  return {
    state: row.state,
    slots: row.slots as Session["slots"],
    counters: row.counters as Session["counters"],
    updatedAt: row.updatedAt,
  };
}

// Distinguishes "first-ever contact" (or "wiped by a reset, from anywhere")
// from "picking up an in-progress conversation" — getSession alone can't
// tell the two apart, since both return a fresh defaultSession().
export async function sessionRowExists(from: string): Promise<boolean> {
  const row = await prisma.sandboxSession.findUnique({ where: { id: from }, select: { id: true } });
  return row !== null;
}

export async function saveSession(from: string, session: Session): Promise<void> {
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
  await prisma.sandboxSession.deleteMany({ where: { id: from } });
}

// Every browser-local Sandbox widget session is created with this prefix
// (see getOrCreateFrom in app/components/sandbox-chat/storage.ts) — real WhatsApp sessions are keyed by
// waId instead, which never matches it. Used by the operator console's
// "reset everything" button so repeated testing never gets stuck, without
// ever touching a real citizen's in-progress conversation.
const SANDBOX_SESSION_ID_PREFIX = "sandbox-";

export async function resetAllSandboxTestSessions(): Promise<void> {
  await prisma.sandboxSession.deleteMany({
    where: { id: { startsWith: SANDBOX_SESSION_ID_PREFIX } },
  });
}
