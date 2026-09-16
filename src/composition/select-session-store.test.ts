import { afterEach, describe, expect, it, vi } from "vitest";
import type pino from "pino";
import type { SessionStore } from "../ports/session-store.js";
import { createSession } from "../domain/conversation-session.js";
import { selectSessionStore } from "./select-session-store.js";

// vitest.setup.ts points REDIS_URL at the dead port 127.0.0.1:6399.
const DEAD_REDIS_URL = "redis://127.0.0.1:6399";

function fakeLogger() {
  return { info: vi.fn(), warn: vi.fn(), error: vi.fn() } as unknown as pino.Logger;
}

describe("selectSessionStore", () => {
  let store: SessionStore | undefined;

  afterEach(async () => {
    await store?.close();
    store = undefined;
  });

  it("defaults to the redis adapter when SESSION_STORE_DRIVER is unset", () => {
    const logger = fakeLogger();
    store = selectSessionStore({ config: { redisUrl: DEAD_REDIS_URL }, logger });

    expect(store.mode).toBe("redis");
  });

  it("does not throw and still returns a usable redis store when the underlying Redis is unreachable", async () => {
    const logger = fakeLogger();

    expect(() => {
      store = selectSessionStore({
        config: { sessionStoreDriver: "redis", redisUrl: DEAD_REDIS_URL },
        logger,
      });
    }).not.toThrow();

    const session = createSession("5".repeat(64), 3600);
    await expect(store!.save(session)).rejects.toThrow();
  });

  it("uses the memory adapter and warns loudly when SESSION_STORE_DRIVER=memory outside production", () => {
    const logger = fakeLogger();
    store = selectSessionStore({
      config: { sessionStoreDriver: "memory", nodeEnv: "development", redisUrl: DEAD_REDIS_URL },
      logger,
    });

    expect(store.mode).toBe("memory");
    expect(logger.warn).toHaveBeenCalledTimes(1);
  });

  it("throws before constructing anything when SESSION_STORE_DRIVER=memory and NODE_ENV=production", () => {
    const logger = fakeLogger();

    expect(() =>
      selectSessionStore({
        config: { sessionStoreDriver: "memory", nodeEnv: "production", redisUrl: DEAD_REDIS_URL },
        logger,
      })
    ).toThrow(/production/);
  });

  it("throws when SESSION_STORE_DRIVER is an unrecognized value", () => {
    const logger = fakeLogger();

    expect(() =>
      selectSessionStore({
        config: { sessionStoreDriver: "postgres", redisUrl: DEAD_REDIS_URL },
        logger,
      })
    ).toThrow(/postgres/);
  });
});
