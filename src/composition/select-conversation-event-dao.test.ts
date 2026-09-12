import { afterEach, describe, expect, it, vi } from "vitest";
import type pino from "pino";
import type { ConversationEventDao } from "../ports/conversation-event-dao.js";
import type { InboundConversationEvent } from "../domain/inbound-conversation-event.js";
import { selectConversationEventDao } from "./select-conversation-event-dao.js";

// vitest.setup.ts points REDIS_URL at the dead port 127.0.0.1:6399.
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

describe("selectConversationEventDao", () => {
  let dao: ConversationEventDao | undefined;

  afterEach(async () => {
    await dao?.close();
    dao = undefined;
  });

  it("defaults to the redis adapter when QUEUE_DRIVER is unset", () => {
    const logger = fakeLogger();
    dao = selectConversationEventDao({ config: { redisUrl: DEAD_REDIS_URL }, logger });

    expect(dao.mode).toBe("redis");
  });

  it("does not throw and still returns a usable redis DAO when the underlying Redis is unreachable", async () => {
    const logger = fakeLogger();

    expect(() => {
      dao = selectConversationEventDao({
        config: { queueDriver: "redis", redisUrl: DEAD_REDIS_URL },
        logger,
      });
    }).not.toThrow();

    await expect(dao!.save(fakeEvent())).rejects.toThrow();
  });

  it("uses the memory adapter and warns loudly when QUEUE_DRIVER=memory outside production", () => {
    const logger = fakeLogger();
    dao = selectConversationEventDao({
      config: { queueDriver: "memory", nodeEnv: "development", redisUrl: DEAD_REDIS_URL },
      logger,
    });

    expect(dao.mode).toBe("memory");
    expect(logger.warn).toHaveBeenCalledTimes(1);
  });

  it("throws before constructing anything when QUEUE_DRIVER=memory and NODE_ENV=production", () => {
    const logger = fakeLogger();

    expect(() =>
      selectConversationEventDao({
        config: { queueDriver: "memory", nodeEnv: "production", redisUrl: DEAD_REDIS_URL },
        logger,
      })
    ).toThrow(/production/);
  });

  it("throws when QUEUE_DRIVER is an unrecognized value", () => {
    const logger = fakeLogger();

    expect(() =>
      selectConversationEventDao({
        config: { queueDriver: "postgres", redisUrl: DEAD_REDIS_URL },
        logger,
      })
    ).toThrow(/postgres/);
  });
});
