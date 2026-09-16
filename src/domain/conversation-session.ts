// D12/D17 (design revision 2): PUBLISHED CONTRACT — Stages B/C depend on this
// exact shape. `state` is intentionally open (no union of FSM state names,
// those live in the FSM registry) and `slots` is an open bag — this stage
// does not know about Reclamo/Cita fields yet, so nothing here may hardcode
// them.
//
// D17 CONSTRAINT carried forward: `sessionKey` is a one-way HMAC digest
// (see msisdn-fingerprint.ts), never the raw MSISDN. `slots` is persisted at
// rest and must never receive the MSISDN either — Stage B must decide DNI
// handling under the same rule rather than defaulting to "it's just a slot".

/** Open: FSM state names live in the STATE_HANDLERS registry, not here. */
export type ConversationStateName = string;

export type SlotValue = string | number | boolean | null;

/** Ordered visited states, append-only, capped so the Redis value stays bounded. */
export const HISTORY_LIMIT = 50;

const INITIAL_STATE: ConversationStateName = "main_menu";

export interface ConversationSession {
  readonly schemaVersion: 1;
  /**
   * D17: keyed HMAC-SHA256 digest of the citizen MSISDN, 64 hex chars.
   * NOT the MSISDN, and NOT reversible. The raw number is never persisted.
   */
  readonly sessionKey: string;
  readonly state: ConversationStateName;
  readonly slots: Readonly<Record<string, SlotValue>>;
  /** Ordered visited states, append-only, capped at HISTORY_LIMIT. */
  readonly history: readonly ConversationStateName[];
  readonly counters: {
    readonly messagesSent: number;
    readonly messagesReceived: number;
    readonly invalidAttempts: number;
  };
  readonly ttlSeconds: number;
  readonly createdAt: string; // ISO-8601
  readonly updatedAt: string; // ISO-8601
}

/** New session, seeded in `main_menu` with zeroed counters — spec: "New session initialized". */
export function createSession(sessionKey: string, ttlSeconds: number): ConversationSession {
  const now = new Date().toISOString();

  return {
    schemaVersion: 1,
    sessionKey,
    state: INITIAL_STATE,
    slots: {},
    history: [INITIAL_STATE],
    counters: {
      messagesSent: 0,
      messagesReceived: 0,
      invalidAttempts: 0,
    },
    ttlSeconds,
    createdAt: now,
    updatedAt: now,
  };
}

/**
 * Advances `state` and appends it to `history`, dropping the oldest entries
 * once the append-only log exceeds HISTORY_LIMIT (sliding window, not a hard
 * stop — the log keeps growing, it just forgets its own oldest past).
 */
export function withState(session: ConversationSession, next: ConversationStateName): ConversationSession {
  return {
    ...session,
    state: next,
    history: [...session.history, next].slice(-HISTORY_LIMIT),
    updatedAt: new Date().toISOString(),
  };
}
