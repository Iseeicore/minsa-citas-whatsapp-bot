import { describe, expect, it, vi } from "vitest";
import type pino from "pino";
import { createMemoryConversationQueue } from "./memory-conversation-queue.js";

function fakeLogger() {
  return { info: vi.fn(), warn: vi.fn(), error: vi.fn() } as unknown as pino.Logger;
}

describe("createMemoryConversationQueue", () => {
  it("reports mode as memory", () => {
    const queue = createMemoryConversationQueue({ logger: fakeLogger() });
    expect(queue.mode).toBe("memory");
  });

  it("gives each factory call an independent backlog — no shared module-scope state", async () => {
    const loggerA = fakeLogger();
    const loggerB = fakeLogger();

    const queueA = createMemoryConversationQueue({ logger: loggerA });
    const queueB = createMemoryConversationQueue({ logger: loggerB });

    await queueA.add("event-a", { a: 1 });
    await queueA.add("event-a", { a: 2 });
    await queueB.add("event-b", { b: 1 });

    expect(loggerA.info).toHaveBeenLastCalledWith(
      { event: "event-a", pending: 2 },
      "[conversation-queue:memory] evento encolado"
    );
    expect(loggerB.info).toHaveBeenLastCalledWith(
      { event: "event-b", pending: 1 },
      "[conversation-queue:memory] evento encolado"
    );
  });

  it("close() resolves without throwing — no external connection to release", async () => {
    const queue = createMemoryConversationQueue({ logger: fakeLogger() });
    await expect(queue.close()).resolves.toBeUndefined();
  });
});
