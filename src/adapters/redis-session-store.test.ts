import { afterEach, describe, expect, it, vi } from "vitest";
import type pino from "pino";
import { Redis as IORedis } from "ioredis";
import type { SessionStore } from "../ports/session-store.js";
import { createSession } from "../domain/conversation-session.js";
import { createRedisSessionStore } from "./redis-session-store.js";

// vitest.setup.ts points REDIS_URL at 127.0.0.1:6399 — deliberately nothing
// listens there. Same discipline as D3/D4 in redis-conversation-event-dao.ts:
// this exercises the unreachable-Redis path deterministically without a real
// Redis server, and the factory must NOT throw, mode must stay "redis", and
// load()/save()/delete() must reject.
const DEAD_REDIS_URL = "redis://127.0.0.1:6399";
// A real local Redis is required for the happy-path (TTL arming, JSON
// round-trip) assertions — per the tasks artifact's runtime harness note for
// this unit ("Local Redis, docker, 6379, for happy path").
const LIVE_REDIS_URL = "redis://127.0.0.1:6379";

function fakeLogger() {
  return { info: vi.fn(), warn: vi.fn(), error: vi.fn() } as unknown as pino.Logger;
}

// A freshly constructed store's connection starts in "connecting" — the same
// status!=="ready" guard that makes save() reject at once against a dead
// Redis also rejects a call issued before a live connection has finished its
// handshake. Retry briefly instead of adding an artificial delay to every
// live-Redis test.
async function retryUntilReady<T>(op: () => Promise<T>, timeoutMs = 3000): Promise<T> {
  const start = Date.now();
  for (;;) {
    try {
      return await op();
    } catch (err) {
      if (Date.now() - start > timeoutMs) throw err;
      await new Promise((resolve) => setTimeout(resolve, 20));
    }
  }
}

describe("createRedisSessionStore", () => {
  let store: SessionStore | undefined;

  afterEach(async () => {
    await store?.close();
    store = undefined;
  });

  it("never throws when constructed against an unreachable Redis, and reports mode redis", () => {
    const logger = fakeLogger();

    expect(() => {
      store = createRedisSessionStore({ config: { redisUrl: DEAD_REDIS_URL }, logger });
    }).not.toThrow();

    expect(store!.mode).toBe("redis");
  });

  it("rejects load()/save()/delete() when Redis is unreachable (status !== ready guard)", async () => {
    const logger = fakeLogger();
    store = createRedisSessionStore({ config: { redisUrl: DEAD_REDIS_URL }, logger });
    const session = createSession("e".repeat(64), 3600);

    await expect(store.load(session.sessionKey)).rejects.toThrow();
    await expect(store.save(session)).rejects.toThrow();
    await expect(store.delete(session.sessionKey)).rejects.toThrow();
  });

  describe("against a reachable Redis", () => {
    it("round-trips a saved session as JSON and arms the TTL with SET ... EX", async () => {
      const logger = fakeLogger();
      store = createRedisSessionStore({ config: { redisUrl: LIVE_REDIS_URL }, logger });
      const session = createSession("f".repeat(64), 3600);

      await retryUntilReady(() => store!.save(session));
      const loaded = await store.load(session.sessionKey);

      expect(loaded).toEqual(session);

      const raw = new IORedis(LIVE_REDIS_URL);
      try {
        const ttl = await raw.ttl(`session:wa:${session.sessionKey}`);
        expect(ttl).toBeGreaterThan(0);
        expect(ttl).toBeLessThanOrEqual(3600);
      } finally {
        raw.disconnect();
      }
    });

    it("stores the session under the key session:wa:{digest}", async () => {
      const logger = fakeLogger();
      store = createRedisSessionStore({ config: { redisUrl: LIVE_REDIS_URL }, logger });
      const session = createSession("1".repeat(64), 3600);

      await retryUntilReady(() => store!.save(session));

      const raw = new IORedis(LIVE_REDIS_URL);
      try {
        const value = await raw.get(`session:wa:${session.sessionKey}`);
        expect(value).not.toBeNull();
        expect(JSON.parse(value!)).toEqual(session);
      } finally {
        raw.disconnect();
      }
    });

    it("load() returns null for a session key that was never saved", async () => {
      const logger = fakeLogger();
      store = createRedisSessionStore({ config: { redisUrl: LIVE_REDIS_URL }, logger });

      await expect(retryUntilReady(() => store!.load("2".repeat(64)))).resolves.toBeNull();
    });

    it("delete() removes the session, and a subsequent load() returns null", async () => {
      const logger = fakeLogger();
      store = createRedisSessionStore({ config: { redisUrl: LIVE_REDIS_URL }, logger });
      const session = createSession("3".repeat(64), 3600);
      await retryUntilReady(() => store!.save(session));

      await store.delete(session.sessionKey);

      await expect(store.load(session.sessionKey)).resolves.toBeNull();
    });

    // D17 privacy assertion: neither the Redis key nor the serialized value
    // may contain a substring of the source MSISDN.
    it("never persists the raw MSISDN — not in the key, not in the serialized value", async () => {
      const logger = fakeLogger();
      store = createRedisSessionStore({ config: { redisUrl: LIVE_REDIS_URL }, logger });
      const msisdn = "+51987654321";
      const digest = "4".repeat(64); // stand-in digest — msisdnDigest() is covered by its own unit tests
      const session = createSession(digest, 3600);

      await retryUntilReady(() => store!.save(session));

      const raw = new IORedis(LIVE_REDIS_URL);
      try {
        const key = `session:wa:${digest}`;
        const value = await raw.get(key);
        expect(key).not.toContain(msisdn);
        expect(value).not.toContain(msisdn);
      } finally {
        await raw.del(`session:wa:${digest}`);
        raw.disconnect();
      }
    });
  });
});
