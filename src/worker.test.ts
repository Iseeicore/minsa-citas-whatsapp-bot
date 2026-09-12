import { afterEach, describe, expect, it, vi } from "vitest";
import type { Job, Worker } from "bullmq";
import type { Redis as IORedis } from "ioredis";

// Every test resets modules and re-imports "./logger.js" BEFORE "./worker.js"
// in the same cycle: worker.js's own import of the shared logger must resolve
// to the exact instance under test, or a spy on a stale instance silently
// sees zero calls.
describe("worker", () => {
  afterEach(() => {
    vi.restoreAllMocks();
    delete process.env.QUEUE_DRIVER;
  });

  describe("processConversationEvent", () => {
    it("logs jobId, name, and attemptsMade, and resolves without throwing", async () => {
      vi.resetModules();
      const { logger } = await import("./logger.js");
      const infoSpy = vi.spyOn(logger, "info").mockImplementation(() => logger);
      const { processConversationEvent } = await import("./worker.js");

      const job = { id: "job-1", name: "inbound-event", attemptsMade: 0 } as unknown as Job;

      await expect(processConversationEvent(job)).resolves.toBeUndefined();
      expect(infoSpy).toHaveBeenCalledWith(
        { jobId: "job-1", name: "inbound-event", attemptsMade: 0 },
        "conversation-events job received"
      );
    });

    it("logs a different job's identity — proves the fields come from the job, not a hardcoded value", async () => {
      vi.resetModules();
      const { logger } = await import("./logger.js");
      const infoSpy = vi.spyOn(logger, "info").mockImplementation(() => logger);
      const { processConversationEvent } = await import("./worker.js");

      const job = { id: "job-2", name: "status-update", attemptsMade: 2 } as unknown as Job;

      await processConversationEvent(job);
      expect(infoSpy).toHaveBeenCalledWith(
        { jobId: "job-2", name: "status-update", attemptsMade: 2 },
        "conversation-events job received"
      );
    });
  });

  describe("assertRedisDriver", () => {
    it("does not throw when QUEUE_DRIVER is unset", async () => {
      vi.resetModules();
      const { assertRedisDriver } = await import("./worker.js");
      expect(() => assertRedisDriver()).not.toThrow();
    });

    it("refuses to start when QUEUE_DRIVER=memory — a memory queue has no cross-process consumer", async () => {
      process.env.QUEUE_DRIVER = "memory";
      vi.resetModules();
      const { assertRedisDriver } = await import("./worker.js");

      expect(() => assertRedisDriver()).toThrow(/memoria/);
    });
  });

  describe("shutdown handling", () => {
    it("closes the worker and quits the connection once, then exits(0)", async () => {
      vi.resetModules();
      const { createShutdownHandler } = await import("./worker.js");
      const exitSpy = vi.spyOn(process, "exit").mockImplementation(() => undefined as never);
      const worker = { close: vi.fn().mockResolvedValue(undefined) } as unknown as Worker;
      const connection = { quit: vi.fn().mockResolvedValue(undefined) } as unknown as IORedis;

      const shutdown = createShutdownHandler({ worker, connection });

      await shutdown("SIGTERM");
      await shutdown("SIGTERM"); // second fire must be a no-op — guarded against double-fire

      expect(worker.close).toHaveBeenCalledTimes(1);
      expect(connection.quit).toHaveBeenCalledTimes(1);
      expect(exitSpy).toHaveBeenCalledTimes(1);
      expect(exitSpy).toHaveBeenCalledWith(0);
    });

    it("logs and exits(1) when closing fails", async () => {
      vi.resetModules();
      const { logger } = await import("./logger.js");
      const errorSpy = vi.spyOn(logger, "error").mockImplementation(() => logger);
      const { createShutdownHandler } = await import("./worker.js");
      const exitSpy = vi.spyOn(process, "exit").mockImplementation(() => undefined as never);
      const worker = {
        close: vi.fn().mockRejectedValue(new Error("close failed")),
      } as unknown as Worker;
      const connection = { quit: vi.fn().mockResolvedValue(undefined) } as unknown as IORedis;

      const shutdown = createShutdownHandler({ worker, connection });
      await shutdown("SIGTERM");

      expect(exitSpy).toHaveBeenCalledWith(1);
      expect(errorSpy).toHaveBeenCalled();
    });
  });
});
