import { afterEach, describe, expect, it, vi } from "vitest";
import type pino from "pino";
import type { ConversationEventDao } from "../ports/conversation-event-dao.js";
import type { InboundConversationEvent } from "../domain/inbound-conversation-event.js";
import { createRedisConversationEventDao } from "./redis-conversation-event-dao.js";

// vitest.setup.ts points REDIS_URL at 127.0.0.1:6399 — deliberately nothing
// listens there. This exercises the unreachable-Redis path deterministically
// without a real Redis server, per D3: the factory must NOT throw, mode must
// stay "redis", and save() must reject.
const DEAD_REDIS_URL = "redis://127.0.0.1:6399";

function fakeLogger() {
  return { info: vi.fn(), warn: vi.fn(), error: vi.fn() } as unknown as pino.Logger;
}

function fakeEvent(): InboundConversationEvent {
  return {
    eventId: "wamid.test",
    receivedAt: new Date().toISOString(),
    source: "whatsapp",
    messageType: "text",
    raw: { entry: [] },
  };
}

describe("createRedisConversationEventDao", () => {
  let dao: ConversationEventDao | undefined;

  afterEach(async () => {
    await dao?.close();
    dao = undefined;
  });

  it("never throws when constructed against an unreachable Redis, and reports mode redis", () => {
    const logger = fakeLogger();

    expect(() => {
      dao = createRedisConversationEventDao({ config: { redisUrl: DEAD_REDIS_URL }, logger });
    }).not.toThrow();

    expect(dao!.mode).toBe("redis");
  });

  it("rejects save() and logs a connection error via the shared logger when Redis is unreachable", async () => {
    const logger = fakeLogger();
    dao = createRedisConversationEventDao({ config: { redisUrl: DEAD_REDIS_URL }, logger });

    await expect(dao.save(fakeEvent())).rejects.toThrow();

    // save() rejects immediately from the status guard, independent of the
    // ioredis connection's own async ECONNREFUSED — wait for that separate
    // 'error' event to reach the shared logger.
    await vi.waitFor(() => expect(logger.error).toHaveBeenCalled(), { timeout: 5000 });
    const [context] = vi.mocked(logger.error).mock.calls[0] as [Record<string, unknown>];
    expect(context.err).toBeInstanceOf(Error);
  }, 10000);
});
