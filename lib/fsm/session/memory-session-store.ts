import type { Session } from "@/lib/fsm/core/types";
import { SESSION_IDLE_TIMEOUT_MS } from "@/lib/fsm/session/session-expiry-guard";

// Session storage for DATABASE_ENABLED=false: each citizen's conversation state
// lives in this process's memory. Correct only with ONE running instance — a
// second replica would not see these sessions — and a restart makes every
// in-progress citizen start over.

// Six times the idle timeout (one hour): a session must outlive
// SESSION_IDLE_TIMEOUT_MS so the idle-expiry guard still sees it and answers
// "your session expired", like it does with the database; after that the
// citizen is simply treated as a new contact. It also bounds memory: nothing
// idle for an hour is kept.
export const MEMORY_SESSION_TTL_MS = 6 * SESSION_IDLE_TIMEOUT_MS;

const SWEEP_INTERVAL_MS = 60_000;

// Same prefix as the database store (see session-store.ts).
const SANDBOX_SESSION_ID_PREFIX = "sandbox-";

type Stored = { state: string; slots: Session["slots"]; counters: Session["counters"]; updatedAt: number };

export type MemorySessionStore = ReturnType<typeof createMemorySessionStore>;

export function createMemorySessionStore(options: { now?: () => number; ttlMs?: number } = {}) {
  const now = options.now ?? Date.now;
  const ttlMs = options.ttlMs ?? MEMORY_SESSION_TTL_MS;
  const sessions = new Map<string, Stored>();
  let lastSweep = now();

  const isExpired = (stored: Stored) => now() - stored.updatedAt >= ttlMs;

  // Drops everything idle past the TTL, so the map never holds more than the
  // citizens active in the last TTL window. A full pass runs at most once a
  // minute (or when forced); a single lookup checks its own entry every time.
  function evictIdle(force = false): void {
    if (!force && now() - lastSweep < SWEEP_INTERVAL_MS) return;
    lastSweep = now();
    for (const [id, stored] of sessions) {
      if (isExpired(stored)) sessions.delete(id);
    }
  }

  function read(from: string): Stored | undefined {
    evictIdle();
    const stored = sessions.get(from);
    if (stored && isExpired(stored)) {
      sessions.delete(from);
      return undefined;
    }
    return stored;
  }

  return {
    async getSession(from: string): Promise<Session> {
      const stored = read(from);
      if (!stored) return { state: "main_menu", slots: {}, counters: {} };
      return {
        state: stored.state,
        slots: structuredClone(stored.slots),
        counters: structuredClone(stored.counters),
        updatedAt: new Date(stored.updatedAt),
      };
    },

    async sessionRowExists(from: string): Promise<boolean> {
      return read(from) !== undefined;
    },

    async findSession(from: string): Promise<{ state: string } | null> {
      const stored = read(from);
      return stored ? { state: stored.state } : null;
    },

    async saveSession(from: string, session: Session): Promise<void> {
      evictIdle();
      sessions.set(from, {
        state: session.state,
        slots: structuredClone(session.slots),
        counters: structuredClone(session.counters),
        updatedAt: now(),
      });
    },

    async resetSession(from: string): Promise<void> {
      sessions.delete(from);
    },

    async resetAllSandboxTestSessions(): Promise<void> {
      for (const id of sessions.keys()) {
        if (id.startsWith(SANDBOX_SESSION_ID_PREFIX)) sessions.delete(id);
      }
    },

    size(): number {
      evictIdle(true);
      return sessions.size;
    },
  };
}
