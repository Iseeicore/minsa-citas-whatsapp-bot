import { afterEach, describe, expect, it, vi } from "vitest";
import type pino from "pino";
import { Queue, Worker } from "bullmq";
import { Redis as IORedis } from "ioredis";
import type { ScheduledCheckScheduler } from "../ports/scheduled-check-scheduler.js";
import type { ConversationJobData, ScheduledCheckJobData } from "../domain/conversation-job.js";
import { isScheduledCheckJob } from "../domain/conversation-job.js";
import { CONVERSATION_QUEUE_NAME } from "../domain/conversation-queue.js";
import type { ButtonMessage, InteractiveList, WhatsappOutboundSender } from "../ports/whatsapp-outbound-sender.js";
import type { ReniecLookupClient } from "../ports/reniec-lookup-client.js";
import type { QuejasSubmissionClient } from "../ports/quejas-submission-client.js";
import type { WhatsappMediaDownloader } from "../ports/whatsapp-media-downloader.js";
import type { ConversationSession } from "../domain/conversation-session.js";
import { createMemorySessionStore } from "./memory-session-store.js";
import { createConversationFlowService } from "../services/conversation-flow.js";
import { createRedisScheduledCheckScheduler } from "./redis-scheduled-check-scheduler.js";

// Same discipline as redis-conversation-event-dao.test.ts / redis-session-store.test.ts:
// vitest.setup.ts points REDIS_URL at 127.0.0.1:6399 (deliberately nothing
// listens there) for the dead-Redis path, and a real local Redis at 6379 is
// required for the reachable-Redis assertions (runtime harness).
const DEAD_REDIS_URL = "redis://127.0.0.1:6399";
const LIVE_REDIS_URL = "redis://127.0.0.1:6379";

function fakeLogger() {
  return { info: vi.fn(), warn: vi.fn(), error: vi.fn() } as unknown as pino.Logger;
}

async function retryUntilReady<T>(op: () => Promise<T>, timeoutMs = 3000): Promise<T> {
  const start = Date.now();
  for (;;) {
    try {
      return await op();
    } catch (err) {
      if (Date.now() - start > timeoutMs) throw err;
      await new Promise((resolve) => setTimeout(resolve, 20));
    }
  }
}

function makeJobData(overrides: Partial<ScheduledCheckJobData> = {}): ScheduledCheckJobData {
  return {
    source: "schedule",
    sessionKey: "0".repeat(64),
    to: "51999999999",
    kind: "cita_registration_wait_elapsed",
    waitToken: "registro_wait:1",
    expectedState: "main_menu",
    scheduledAt: "2026-01-01T00:00:00.000Z",
    ...overrides,
  };
}

function fakeSender(): { sender: WhatsappOutboundSender; calls: { method: string; to: string }[] } {
  const calls: { method: string; to: string }[] = [];
  const sender: WhatsappOutboundSender = {
    async sendText(to: string) {
      calls.push({ method: "sendText", to });
    },
    async sendInteractiveList(to: string, _list: InteractiveList) {
      calls.push({ method: "sendInteractiveList", to });
    },
    async sendButtons(to: string, _buttons: ButtonMessage) {
      calls.push({ method: "sendButtons", to });
    },
  };
  return { sender, calls };
}

const noopReniecLookupClient: ReniecLookupClient = {
  async lookup() {
    return { status: "not_found" };
  },
};
const noopQuejasSubmissionClient: QuejasSubmissionClient = {
  async submit() {
    return { status: "accepted" };
  },
};
const noopWhatsappMediaDownloader: WhatsappMediaDownloader = {
  async download() {
    return { bytes: new Uint8Array(), mimeType: "image/jpeg", sizeBytes: 0 };
  },
};

function fullSession(overrides: Partial<ConversationSession> = {}): ConversationSession {
  const now = new Date().toISOString();
  return {
    schemaVersion: 1,
    sessionKey: "0".repeat(64),
    state: "main_menu",
    slots: {},
    history: ["main_menu"],
    counters: { messagesSent: 0, messagesReceived: 0, invalidAttempts: 0 },
    ttlSeconds: 3600,
    createdAt: now,
    updatedAt: now,
    ...overrides,
  };
}

/** Waits for a BullMQ Worker's "completed" event for the job matching `sessionKey`. */
function waitForCompletion(worker: Worker, sessionKey: string, timeoutMs = 8000): Promise<void> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error("timed out waiting for the scheduled job to complete")), timeoutMs);
    worker.on("completed", (job) => {
      if ((job.data as ConversationJobData).sessionKey === sessionKey) {
        clearTimeout(timer);
        resolve();
      }
    });
  });
}

describe("createRedisScheduledCheckScheduler", () => {
  let scheduler: ScheduledCheckScheduler | undefined;

  afterEach(async () => {
    await scheduler?.close();
    scheduler = undefined;
  });

  it("never throws when constructed against an unreachable Redis (D3)", () => {
    const logger = fakeLogger();

    expect(() => {
      scheduler = createRedisScheduledCheckScheduler({ config: { redisUrl: DEAD_REDIS_URL }, logger });
    }).not.toThrow();
  });

  it("rejects schedule() and logs a connection error via the shared logger when Redis is unreachable", async () => {
    const logger = fakeLogger();
    scheduler = createRedisScheduledCheckScheduler({ config: { redisUrl: DEAD_REDIS_URL }, logger });

    await expect(scheduler.schedule(makeJobData(), 300)).rejects.toThrow();

    await vi.waitFor(() => expect(logger.error).toHaveBeenCalled(), { timeout: 5000 });
    const [context] = vi.mocked(logger.error).mock.calls[0] as [Record<string, unknown>];
    expect(context.err).toBeInstanceOf(Error);
  }, 10000);

  describe("against a reachable Redis", () => {
    it("enqueues a delayed job on CONVERSATION_QUEUE_NAME with delay = delaySeconds * 1000 and the exact payload", async () => {
      const logger = fakeLogger();
      scheduler = createRedisScheduledCheckScheduler({ config: { redisUrl: LIVE_REDIS_URL }, logger });
      const data = makeJobData({ sessionKey: "1".repeat(64) });

      await retryUntilReady(() => scheduler!.schedule(data, 30));

      const inspect = new Queue(CONVERSATION_QUEUE_NAME, { connection: new IORedis(LIVE_REDIS_URL) });
      try {
        const delayed = await inspect.getJobs(["delayed"]);
        const found = delayed.find((job) => (job.data as ConversationJobData).sessionKey === data.sessionKey);
        expect(found).toBeDefined();
        expect(found!.data).toEqual(data);
        expect(found!.opts.delay).toBe(30000);
        await found!.remove();
      } finally {
        await inspect.close();
      }
    });

    // D29/D31 (runtime harness): a real Queue -> real delayed job -> real
    // BullMQ Worker fire -> processScheduled() — the first time in this
    // codebase the delayed-job mechanism actually fires end to end, proving
    // the idempotency check for a MATCHING state+token pair.
    it("fires after the delay and processScheduled() proceeds — matching state AND token (D31)", async () => {
      const logger = fakeLogger();
      scheduler = createRedisScheduledCheckScheduler({ config: { redisUrl: LIVE_REDIS_URL }, logger });
      const sessionStore = createMemorySessionStore({ logger });
      const { sender, calls } = fakeSender();
      const sessionKey = "2".repeat(64);
      await sessionStore.save(fullSession({ sessionKey, state: "main_menu", slots: { citaWaitToken: "registro_wait:1" } }));

      const conversationFlow = createConversationFlowService({
        sessionStore,
        sender,
        reniecLookupClient: noopReniecLookupClient,
        quejasSubmissionClient: noopQuejasSubmissionClient,
        whatsappMediaDownloader: noopWhatsappMediaDownloader,
        scheduledCheckScheduler: scheduler,
        config: { sessionKeySecret: "test-secret", sessionTtlSeconds: 3600 },
      });

      const workerConnection = new IORedis(LIVE_REDIS_URL, { maxRetriesPerRequest: null });
      const worker = new Worker(
        CONVERSATION_QUEUE_NAME,
        async (job) => {
          const data = job.data as ConversationJobData;
          if (isScheduledCheckJob(data)) await conversationFlow.processScheduled(data);
        },
        { connection: workerConnection }
      );

      try {
        await retryUntilReady(() =>
          scheduler!.schedule(
            makeJobData({ sessionKey, to: "51999999999", expectedState: "main_menu", waitToken: "registro_wait:1" }),
            1
          )
        );

        await waitForCompletion(worker, sessionKey);

        expect(calls).toEqual([{ method: "sendInteractiveList", to: "51999999999" }]);
        const stored = await sessionStore.load(sessionKey);
        expect(stored?.counters.messagesSent).toBe(1);
      } finally {
        await worker.close();
        await workerConnection.quit();
      }
    }, 10000);

    // Threat: untrusted job payload (design's threat matrix) — a stale
    // token from a superseded wait must be a silent no-op at fire time,
    // proven here against a REAL fired job, not a direct processScheduled()
    // call.
    it("fires after the delay and processScheduled() is a silent no-op — mismatched token (D31)", async () => {
      const logger = fakeLogger();
      scheduler = createRedisScheduledCheckScheduler({ config: { redisUrl: LIVE_REDIS_URL }, logger });
      const sessionStore = createMemorySessionStore({ logger });
      const { sender, calls } = fakeSender();
      const sessionKey = "3".repeat(64);
      // The session already moved on to wait #2 — a delayed job still
      // carrying wait #1's token must not touch it.
      await sessionStore.save(fullSession({ sessionKey, state: "main_menu", slots: { citaWaitToken: "registro_wait:2" } }));

      const conversationFlow = createConversationFlowService({
        sessionStore,
        sender,
        reniecLookupClient: noopReniecLookupClient,
        quejasSubmissionClient: noopQuejasSubmissionClient,
        whatsappMediaDownloader: noopWhatsappMediaDownloader,
        scheduledCheckScheduler: scheduler,
        config: { sessionKeySecret: "test-secret", sessionTtlSeconds: 3600 },
      });

      const workerConnection = new IORedis(LIVE_REDIS_URL, { maxRetriesPerRequest: null });
      const worker = new Worker(
        CONVERSATION_QUEUE_NAME,
        async (job) => {
          const data = job.data as ConversationJobData;
          if (isScheduledCheckJob(data)) await conversationFlow.processScheduled(data);
        },
        { connection: workerConnection }
      );

      try {
        await retryUntilReady(() =>
          scheduler!.schedule(
            makeJobData({ sessionKey, to: "51999999999", expectedState: "main_menu", waitToken: "registro_wait:1" }),
            1
          )
        );

        await waitForCompletion(worker, sessionKey);

        expect(calls).toHaveLength(0);
        const stored = await sessionStore.load(sessionKey);
        expect(stored?.slots.citaWaitToken).toBe("registro_wait:2");
        expect(stored?.counters.messagesSent).toBe(0);
      } finally {
        await worker.close();
        await workerConnection.quit();
      }
    }, 10000);
  });
});
