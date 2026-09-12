import { afterEach, describe, expect, it, vi } from "vitest";
import type pino from "pino";
import type { ConversationQueue } from "../ports/conversation-queue.js";
import { createRedisConversationQueue } from "./redis-conversation-queue.js";

// vitest.setup.ts points REDIS_URL at 127.0.0.1:6399 — deliberately nothing
// listens there. This exercises the unreachable-Redis path deterministically
// without a real Redis server, per the design's revised D3: the factory must
// NOT throw, mode must stay "redis", and add() must reject.
const DEAD_REDIS_URL = "redis://127.0.0.1:6399";

function fakeLogger() {
  return { info: vi.fn(), warn: vi.fn(), error: vi.fn() } as unknown as pino.Logger;
}

describe("createRedisConversationQueue", () => {
  let queue: ConversationQueue | undefined;

  afterEach(async () => {
    await queue?.close();
    queue = undefined;
  });

  it("never throws when constructed against an unreachable Redis, and reports mode redis", () => {
    const logger = fakeLogger();

    expect(() => {
      queue = createRedisConversationQueue({ config: { redisUrl: DEAD_REDIS_URL }, logger });
    }).not.toThrow();

    expect(queue!.mode).toBe("redis");
  });

  it("rejects add() and logs a connection error via the shared logger when Redis is unreachable", async () => {
    const logger = fakeLogger();
    queue = createRedisConversationQueue({ config: { redisUrl: DEAD_REDIS_URL }, logger });

    await expect(queue.add("inbound-event", { foo: "bar" })).rejects.toThrow();

    // add() rejects immediately from the status guard, independent of the
    // ioredis connection's own async ECONNREFUSED — wait for that separate
    // 'error' event to reach the shared logger.
    await vi.waitFor(() => expect(logger.error).toHaveBeenCalled(), { timeout: 5000 });
    const [context] = vi.mocked(logger.error).mock.calls[0] as [Record<string, unknown>];
    expect(context.err).toBeInstanceOf(Error);
  }, 10000);
});
