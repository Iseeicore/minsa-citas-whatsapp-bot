import type { ConversationSession } from "../domain/conversation-session.js";

// Driven port for conversation session persistence (D11: mirrors
// ConversationEventDao's exact shape/discipline — a hexagonal driven port
// with N implementations owned by infrastructure, one selected explicitly by
// the composition root, src/composition/select-session-store.ts).
//
// This port does NOT derive `sessionKey` from an MSISDN — that is
// msisdnDigest()'s job (D17/D18). It only stores and retrieves whatever
// 64-hex digest it is given as `session.sessionKey`.
export interface SessionStore {
  readonly mode: "redis" | "memory";

  /**
   * Loads the session for `sessionKey`. Returns null when absent or
   * TTL-expired — a caller-visible "no session" state, not an error.
   */
  load(sessionKey: string): Promise<ConversationSession | null>;

  /** Persists `session`, (re)arming the TTL from `session.ttlSeconds`. */
  save(session: ConversationSession): Promise<void>;

  /** Deletes the session for `sessionKey`. No-ops if already absent. */
  delete(sessionKey: string): Promise<void>;

  /**
   * Releases any resources the adapter owns (e.g. the Redis connection).
   * The memory adapter no-ops.
   */
  close(): Promise<void>;
}
