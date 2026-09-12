import { afterEach, describe, expect, it, vi } from "vitest";
import type pino from "pino";
import type { ConversationQueue } from "../ports/conversation-queue.js";
import { selectConversationQueue } from "./select-conversation-queue.js";

// vitest.setup.ts points REDIS_URL at the dead port 127.0.0.1:6399.
const DEAD_REDIS_URL = "redis://127.0.0.1:6399";

function fakeLogger() {
  return { info: vi.fn(), warn: vi.fn(), error: vi.fn() } as unknown as pino.Logger;
}

describe("selectConversationQueue", () => {
  let queue: ConversationQueue | undefined;

  afterEach(async () => {
    await queue?.close();
    queue = undefined;
  });

  it("defaults to the redis adapter when QUEUE_DRIVER is unset", () => {
    const logger = fakeLogger();
    queue = selectConversationQueue({ config: { redisUrl: DEAD_REDIS_URL }, logger });

    expect(queue.mode).toBe("redis");
  });

  it("does not throw and still returns a usable redis port when the underlying Redis is unreachable", async () => {
    const logger = fakeLogger();

    expect(() => {
      queue = selectConversationQueue({
        config: { queueDriver: "redis", redisUrl: DEAD_REDIS_URL },
        logger,
      });
    }).not.toThrow();

    await expect(queue!.add("inbound-event", {})).rejects.toThrow();
  });

  it("uses the memory adapter and warns loudly when QUEUE_DRIVER=memory outside production", () => {
    const logger = fakeLogger();
    queue = selectConversationQueue({
      config: { queueDriver: "memory", nodeEnv: "development", redisUrl: DEAD_REDIS_URL },
      logger,
    });

    expect(queue.mode).toBe("memory");
    expect(logger.warn).toHaveBeenCalledTimes(1);
  });

  it("throws before constructing anything when QUEUE_DRIVER=memory and NODE_ENV=production", () => {
    const logger = fakeLogger();

    expect(() =>
      selectConversationQueue({
        config: { queueDriver: "memory", nodeEnv: "production", redisUrl: DEAD_REDIS_URL },
        logger,
      })
    ).toThrow(/production/);
  });

  it("throws when QUEUE_DRIVER is an unrecognized value", () => {
    const logger = fakeLogger();

    expect(() =>
      selectConversationQueue({
        config: { queueDriver: "postgres", redisUrl: DEAD_REDIS_URL },
        logger,
      })
    ).toThrow(/postgres/);
  });
});
