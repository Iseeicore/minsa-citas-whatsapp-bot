import { describe, expect, it } from "vitest";
import { HISTORY_LIMIT, createSession, withState } from "./conversation-session.js";
import { msisdnDigest } from "./msisdn-fingerprint.js";

const SECRET = "test-session-key-secret";
const TTL_SECONDS = 3600;

describe("createSession", () => {
  it("initializes a new session in main_menu with zeroed counters and a single-entry history", () => {
    const session = createSession("digest-abc123", TTL_SECONDS);

    expect(session.schemaVersion).toBe(1);
    expect(session.sessionKey).toBe("digest-abc123");
    expect(session.state).toBe("main_menu");
    expect(session.slots).toEqual({});
    expect(session.history).toEqual(["main_menu"]);
    expect(session.counters).toEqual({
      messagesSent: 0,
      messagesReceived: 0,
      invalidAttempts: 0,
    });
    expect(session.ttlSeconds).toBe(TTL_SECONDS);
  });

  it("stamps createdAt and updatedAt as equal ISO-8601 timestamps at creation", () => {
    const session = createSession("digest-abc123", TTL_SECONDS);

    expect(session.createdAt).toBe(session.updatedAt);
    expect(new Date(session.createdAt).toISOString()).toBe(session.createdAt);
  });
});

describe("withState", () => {
  it("advances state and appends the new state to history", () => {
    const initial = createSession("digest-abc123", TTL_SECONDS);

    const next = withState(initial, "awaiting_flow_start");

    expect(next.state).toBe("awaiting_flow_start");
    expect(next.history).toEqual(["main_menu", "awaiting_flow_start"]);
  });

  it("leaves the prior session object unchanged (immutability)", () => {
    const initial = createSession("digest-abc123", TTL_SECONDS);

    withState(initial, "awaiting_flow_start");

    expect(initial.state).toBe("main_menu");
    expect(initial.history).toEqual(["main_menu"]);
  });

  it(`caps history at HISTORY_LIMIT (${HISTORY_LIMIT}) by dropping the oldest entries`, () => {
    let session = createSession("digest-abc123", TTL_SECONDS);

    for (let i = 0; i < HISTORY_LIMIT + 10; i++) {
      session = withState(session, `state_${i}`);
    }

    expect(session.history).toHaveLength(HISTORY_LIMIT);
    // 1 initial "main_menu" entry + (HISTORY_LIMIT + 10) pushed transitions
    // = HISTORY_LIMIT + 11 entries total, sliced to the last HISTORY_LIMIT.
    // The oldest 11 entries ("main_menu", state_0..state_9) are dropped.
    expect(session.history[session.history.length - 1]).toBe(`state_${HISTORY_LIMIT + 9}`);
    expect(session.history[0]).toBe(`state_${10}`);
    expect(session.history).not.toContain("main_menu");
  });
});

// D17 privacy assertion — required by design/spec: the serialized session and
// its derived session key must never contain the raw MSISDN. This is what
// proves ConversationSession is safe to pass to SessionStore.save() in PR3;
// SessionStore itself is out of scope here.
describe("D17 privacy assertion", () => {
  it("excludes the raw MSISDN from both the derived session key and the serialized session", () => {
    const msisdn = "51999999999";
    const sessionKey = msisdnDigest(msisdn, SECRET);

    const session = createSession(sessionKey, TTL_SECONDS);
    const serialized = JSON.stringify(session);

    expect(sessionKey).not.toContain(msisdn);
    expect(serialized).not.toContain(msisdn);
  });
});
