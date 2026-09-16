import type pino from "pino";
import type { SessionStore } from "../ports/session-store.js";
import type { ConversationSession } from "../domain/conversation-session.js";

export interface MemorySessionStoreDeps {
  logger: pino.Logger;
}

interface Entry {
  readonly session: ConversationSession;
  readonly expiresAt: number;
}

// Dev-only adapter (same discipline as memory-conversation-event-dao.ts):
// single-process, sessions lost on restart, must not run with multiple
// replicas or in production (enforced by
// composition/select-session-store.ts, the only place allowed to construct
// this). Each factory call owns its own closure-scoped Map — no
// module-level mutable state (D4).
export function createMemorySessionStore(deps: MemorySessionStoreDeps): SessionStore {
  const { logger } = deps;
  const sessions = new Map<string, Entry>();

  return {
    mode: "memory",
    async load(sessionKey: string) {
      const entry = sessions.get(sessionKey);
      if (!entry) return null;

      if (Date.now() >= entry.expiresAt) {
        sessions.delete(sessionKey);
        return null;
      }

      return entry.session;
    },
    async save(session: ConversationSession) {
      sessions.set(session.sessionKey, {
        session,
        expiresAt: Date.now() + session.ttlSeconds * 1000,
      });
      logger.info(
        { sessionKey: session.sessionKey, state: session.state },
        "[session-store:memory] sesión guardada"
      );
    },
    async delete(sessionKey: string) {
      sessions.delete(sessionKey);
    },
    async close() {
      // No external connection to release.
    },
  };
}
