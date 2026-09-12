import { afterEach, describe, expect, it, vi } from "vitest";

// vitest.setup.ts points REDIS_URL at 127.0.0.1:6399 — deliberately nothing
// listens there, so initConversationQueue() deterministically exercises the
// memory-fallback branch without a real Redis server.
describe("conversation-queue", () => {
  afterEach(() => {
    vi.doUnmock("../logger.js");
    vi.resetModules();
  });

  it("logs the Redis-unreachable fallback via the shared logger, not console.*", async () => {
    const warn = vi.fn();
    const info = vi.fn();
    vi.doMock("../logger.js", () => ({
      logger: { warn, info, error: vi.fn() },
    }));

    const consoleLogSpy = vi.spyOn(console, "log").mockImplementation(() => {});
    const consoleWarnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});

    vi.resetModules();
    const { initConversationQueue, conversationQueue } = await import("./conversation-queue.js");

    await initConversationQueue();

    expect(conversationQueue.mode).toBe("memory");
    expect(warn).toHaveBeenCalledTimes(1);
    expect(consoleLogSpy).not.toHaveBeenCalled();
    expect(consoleWarnSpy).not.toHaveBeenCalled();

    consoleLogSpy.mockRestore();
    consoleWarnSpy.mockRestore();
  }, 10000);
});
