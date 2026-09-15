import { describe, expect, it, vi } from "vitest";
import type pino from "pino";
import { createSession } from "../domain/conversation-session.js";
import { createMemorySessionStore } from "./memory-session-store.js";

function fakeLogger() {
  return { info: vi.fn(), warn: vi.fn(), error: vi.fn() } as unknown as pino.Logger;
}

describe("createMemorySessionStore", () => {
  it("reports mode as memory", () => {
    const store = createMemorySessionStore({ logger: fakeLogger() });
    expect(store.mode).toBe("memory");
  });

  it("returns null for a session key that was never saved", async () => {
    const store = createMemorySessionStore({ logger: fakeLogger() });
    await expect(store.load("never-saved-key")).resolves.toBeNull();
  });

  it("round-trips a saved session by sessionKey", async () => {
    const store = createMemorySessionStore({ logger: fakeLogger() });
    const session = createSession("a".repeat(64), 3600);

    await store.save(session);

    await expect(store.load(session.sessionKey)).resolves.toEqual(session);
  });

  it("delete() removes the session, and a subsequent load() returns null", async () => {
    const store = createMemorySessionStore({ logger: fakeLogger() });
    const session = createSession("b".repeat(64), 3600);
    await store.save(session);

    await store.delete(session.sessionKey);

    await expect(store.load(session.sessionKey)).resolves.toBeNull();
  });

  it("expires a session once its ttlSeconds has elapsed", async () => {
    vi.useFakeTimers();
    try {
      const store = createMemorySessionStore({ logger: fakeLogger() });
      const session = createSession("c".repeat(64), 60); // 60s TTL

      await store.save(session);
      vi.advanceTimersByTime(61_000);

      await expect(store.load(session.sessionKey)).resolves.toBeNull();
    } finally {
      vi.useRealTimers();
    }
  });

  it("gives each factory call an independent backing store — no shared module-scope state", async () => {
    const storeA = createMemorySessionStore({ logger: fakeLogger() });
    const storeB = createMemorySessionStore({ logger: fakeLogger() });
    const session = createSession("d".repeat(64), 3600);

    await storeA.save(session);

    await expect(storeB.load(session.sessionKey)).resolves.toBeNull();
  });

  it("close() resolves without throwing — no external connection to release", async () => {
    const store = createMemorySessionStore({ logger: fakeLogger() });
    await expect(store.close()).resolves.toBeUndefined();
  });
});
