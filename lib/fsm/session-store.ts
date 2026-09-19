import { prisma } from "@/lib/prisma";
import type { Session } from "./types";

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
  };
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
// (see Sandbox.tsx's getOrCreateFrom) — real WhatsApp sessions are keyed by
// waId instead, which never matches it. Used by the operator console's
// "reset everything" button so repeated testing never gets stuck, without
// ever touching a real citizen's in-progress conversation.
const SANDBOX_SESSION_ID_PREFIX = "sandbox-";

export async function resetAllSandboxTestSessions(): Promise<void> {
  await prisma.sandboxSession.deleteMany({
    where: { id: { startsWith: SANDBOX_SESSION_ID_PREFIX } },
  });
}
