import { afterEach, describe, expect, it, vi } from "vitest";
import type { Job, Worker } from "bullmq";
import type { Redis as IORedis } from "ioredis";
import type { InboundConversationEvent } from "./domain/inbound-conversation-event.js";
import type { ConversationFlowService } from "./services/conversation-flow.js";

// Every test resets modules and re-imports "./logger.js" BEFORE "./worker.js"
// in the same cycle: worker.js's own import of the shared logger must resolve
// to the exact instance under test, or a spy on a stale instance silently
// sees zero calls.
describe("worker", () => {
  afterEach(() => {
    vi.restoreAllMocks();
    delete process.env.QUEUE_DRIVER;
  });

  describe("createProcessConversationEvent", () => {
    // D7: job.data is the InboundConversationEvent Entity (D6) — the
    // processor logs job identity plus the sanitized log-view DTO
    // (toLogView), never the raw entity fields (from/text/contactName/raw).
    function fakeEventData(overrides: Partial<InboundConversationEvent> = {}): InboundConversationEvent {
      return {
        eventId: "wamid.abc",
        receivedAt: "2026-01-01T00:00:00.000Z",
        source: "whatsapp",
        messageType: "text",
        from: "51999999999",
        text: "mensaje sensible del ciudadano",
        contactName: "Juan",
        raw: {},
        ...overrides,
      };
    }

    function fakeConversationFlow(processImpl: ConversationFlowService["process"]): ConversationFlowService {
      return { process: processImpl };
    }

    it("logs jobId plus the sanitized log-view DTO, calls conversationFlow.process(job.data), and resolves", async () => {
      vi.resetModules();
      const { logger } = await import("./logger.js");
      const { config } = await import("./config.js");
      const { toLogView } = await import("./domain/inbound-conversation-event-log-view.js");
      const infoSpy = vi.spyOn(logger, "info").mockImplementation(() => logger);
      const { createProcessConversationEvent } = await import("./worker.js");

      const eventData = fakeEventData();
      const job = { id: "job-1", name: "inbound-event", attemptsMade: 0, data: eventData } as unknown as Job;
      const processSpy = vi.fn().mockResolvedValue(undefined);
      const processConversationEvent = createProcessConversationEvent({
        conversationFlow: fakeConversationFlow(processSpy),
      });

      await expect(processConversationEvent(job)).resolves.toBeUndefined();

      expect(processSpy).toHaveBeenCalledWith(eventData);
      const expectedLogView = toLogView(eventData, { logHashSecret: config.logHashSecret });
      expect(infoSpy).toHaveBeenCalledWith(
        { jobId: "job-1", ...expectedLogView },
        "conversation-events job received"
      );
    });

    it("never logs the raw MSISDN or message body — proves the raw job.data fields do not leak through", async () => {
      vi.resetModules();
      const { logger } = await import("./logger.js");
      const infoSpy = vi.spyOn(logger, "info").mockImplementation(() => logger);
      const { createProcessConversationEvent } = await import("./worker.js");

      const eventData = fakeEventData({ eventId: "wamid.def", from: "51988888888", text: "otro mensaje sensible" });
      const job = { id: "job-2", name: "inbound-event", attemptsMade: 2, data: eventData } as unknown as Job;
      const processConversationEvent = createProcessConversationEvent({
        conversationFlow: fakeConversationFlow(vi.fn().mockResolvedValue(undefined)),
      });

      await processConversationEvent(job);

      const [context] = infoSpy.mock.calls[0] as [Record<string, unknown>];
      expect(JSON.stringify(context)).not.toContain("51988888888");
      expect(JSON.stringify(context)).not.toContain("otro mensaje sensible");
      expect(context.jobId).toBe("job-2");
    });

    // D22/DNI-1 (PR5): mirrors the test above, but with Reclamo-shaped
    // content (a DNI and a queja description embedded in the inbound text —
    // this is exactly what a citizen would type at reclamo_awaiting_dni /
    // reclamo_awaiting_descripcion). Proves the same log-leak guard holds
    // for Reclamo traffic specifically, not only for the generic fixture.
    it("D22/DNI-1: never logs a Reclamo DNI or queja description carried in the inbound text", async () => {
      vi.resetModules();
      const { logger } = await import("./logger.js");
      const infoSpy = vi.spyOn(logger, "info").mockImplementation(() => logger);
      const { createProcessConversationEvent } = await import("./worker.js");

      const DNI_TEXT = "12345678";
      const QUEJA_TEXT = `Mi DNI es ${DNI_TEXT}. Hay un poste de luz caído en mi calle, es peligroso.`;
      const eventData = fakeEventData({ eventId: "wamid.reclamo-1", text: QUEJA_TEXT });
      const job = { id: "job-reclamo-1", name: "inbound-event", attemptsMade: 0, data: eventData } as unknown as Job;
      const processConversationEvent = createProcessConversationEvent({
        conversationFlow: fakeConversationFlow(vi.fn().mockResolvedValue(undefined)),
      });

      await processConversationEvent(job);

      const [context] = infoSpy.mock.calls[0] as [Record<string, unknown>];
      const serialized = JSON.stringify(context);
      expect(serialized).not.toContain(DNI_TEXT);
      expect(serialized).not.toContain(QUEJA_TEXT);
    });

    // D14: classifyWorkerOutcome() wraps conversationFlow.process() — a
    // transient infra failure (Redis unreachable, Graph API timeout/5xx)
    // must rethrow so BullMQ's existing 3-attempt exponential backoff still
    // retries the job unchanged.
    it("rethrows when conversationFlow.process() throws a TransientFailureError — BullMQ would retry", async () => {
      vi.resetModules();
      const { logger } = await import("./logger.js");
      vi.spyOn(logger, "info").mockImplementation(() => logger);
      const { TransientFailureError } = await import("./domain/errors.js");
      const { createProcessConversationEvent } = await import("./worker.js");

      const eventData = fakeEventData();
      const job = { id: "job-3", name: "inbound-event", attemptsMade: 0, data: eventData } as unknown as Job;
      const processConversationEvent = createProcessConversationEvent({
        conversationFlow: fakeConversationFlow(
          vi.fn().mockRejectedValue(new TransientFailureError("meta graph api unreachable"))
        ),
      });

      await expect(processConversationEvent(job)).rejects.toBeInstanceOf(TransientFailureError);
    });

    // D14: a business rejection is a terminal, non-retriable stop — the job
    // must resolve normally (no infinite retry loop).
    it("resolves without throwing when conversationFlow.process() throws a BusinessRejectionError — no retry", async () => {
      vi.resetModules();
      const { logger } = await import("./logger.js");
      vi.spyOn(logger, "info").mockImplementation(() => logger);
      const warnSpy = vi.spyOn(logger, "warn").mockImplementation(() => logger);
      const { BusinessRejectionError } = await import("./domain/errors.js");
      const { createProcessConversationEvent } = await import("./worker.js");

      const eventData = fakeEventData();
      const job = { id: "job-4", name: "inbound-event", attemptsMade: 0, data: eventData } as unknown as Job;
      const processConversationEvent = createProcessConversationEvent({
        conversationFlow: fakeConversationFlow(
          vi.fn().mockRejectedValue(new BusinessRejectionError("citizen rejected the flow"))
        ),
      });

      await expect(processConversationEvent(job)).resolves.toBeUndefined();
      expect(warnSpy).toHaveBeenCalled();
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
