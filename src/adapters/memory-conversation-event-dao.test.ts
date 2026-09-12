import { describe, expect, it, vi } from "vitest";
import type pino from "pino";
import type { InboundConversationEvent } from "../domain/inbound-conversation-event.js";
import { createMemoryConversationEventDao } from "./memory-conversation-event-dao.js";

function fakeLogger() {
  return { info: vi.fn(), warn: vi.fn(), error: vi.fn() } as unknown as pino.Logger;
}

function fakeEvent(eventId: string): InboundConversationEvent {
  return {
    eventId,
    receivedAt: new Date().toISOString(),
    source: "whatsapp",
    messageType: "text",
    raw: { entry: [] },
  };
}

describe("createMemoryConversationEventDao", () => {
  it("reports mode as memory", () => {
    const dao = createMemoryConversationEventDao({ logger: fakeLogger() });
    expect(dao.mode).toBe("memory");
  });

  it("gives each factory call an independent backlog — no shared module-scope state", async () => {
    const loggerA = fakeLogger();
    const loggerB = fakeLogger();

    const daoA = createMemoryConversationEventDao({ logger: loggerA });
    const daoB = createMemoryConversationEventDao({ logger: loggerB });

    await daoA.save(fakeEvent("event-a-1"));
    await daoA.save(fakeEvent("event-a-2"));
    await daoB.save(fakeEvent("event-b-1"));

    expect(loggerA.info).toHaveBeenLastCalledWith(
      { eventId: "event-a-2", pending: 2 },
      "[conversation-event-dao:memory] evento guardado"
    );
    expect(loggerB.info).toHaveBeenLastCalledWith(
      { eventId: "event-b-1", pending: 1 },
      "[conversation-event-dao:memory] evento guardado"
    );
  });

  it("close() resolves without throwing — no external connection to release", async () => {
    const dao = createMemoryConversationEventDao({ logger: fakeLogger() });
    await expect(dao.close()).resolves.toBeUndefined();
  });
});
