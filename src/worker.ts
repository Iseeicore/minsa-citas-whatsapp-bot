import { fileURLToPath } from "node:url";
import { Worker, type Job } from "bullmq";
import { Redis as IORedis } from "ioredis";
import { config } from "./config.js";
import { logger } from "./logger.js";
import type { ConversationJobData } from "./domain/conversation-job.js";
import { isScheduledCheckJob } from "./domain/conversation-job.js";
import { toLogView } from "./domain/inbound-conversation-event-log-view.js";
import { toScheduledCheckJobLogView } from "./domain/scheduled-check-job-log-view.js";
import { classifyWorkerOutcome } from "./domain/worker-outcome.js";
import type { ConversationFlowService } from "./services/conversation-flow.js";
import { createConversationFlowService } from "./services/conversation-flow.js";
import type { ScheduledCheckScheduler } from "./ports/scheduled-check-scheduler.js";
import { selectSessionStore } from "./composition/select-session-store.js";
import { createMetaWhatsappSender } from "./adapters/meta-whatsapp-sender.js";
import { createHttpReniecLookupClient } from "./adapters/http-reniec-lookup-client.js";
import { createHttpQuejasSubmissionClient } from "./adapters/http-quejas-submission-client.js";
import { createMetaMediaDownloader } from "./adapters/meta-media-downloader.js";
import { createRedisScheduledCheckScheduler } from "./adapters/redis-scheduled-check-scheduler.js";
import { createHttpMinsaIdentityClient } from "./adapters/http-minsa-identity-client.js";
import { createHttpMinsaCatalogClient } from "./adapters/http-minsa-catalog-client.js";
import { createNoopAiFallbackClient } from "./adapters/noop-ai-fallback-client.js";
import { redactRedisUrl } from "./adapters/redis-conversation-event-dao.js";
import { CONVERSATION_QUEUE_NAME } from "./domain/conversation-queue.js";

// D5: the worker is a separate process from the HTTP server and requires
// Redis unconditionally — no memory fallback. A memory queue has no
// cross-process consumer, so running the worker against it would silently
// do nothing useful; refuse to start instead.
export function assertRedisDriver(): void {
  if (config.queueDriver === "memory") {
    throw new Error(
      "[worker] QUEUE_DRIVER=memory no es válido para el worker: la cola en memoria " +
        "no tiene consumidor entre procesos."
    );
  }
}

export interface ProcessConversationEventDeps {
  conversationFlow: ConversationFlowService;
}

// D6: job.data is now a ConversationJobData union (D30, Stage C1, PR5) — the
// existing InboundConversationEvent arm, unchanged, plus a new discriminated
// scheduled-check arm delivered on the SAME queue. D7/D17 carried forward to
// the scheduled arm: logs the sanitized log-view DTO for whichever arm the
// job is, never job.data directly — job.data carries the MSISDN and message
// body on the inbound arm.
//
// D14: wraps conversation-flow's single I/O pipeline (load -> handle ->
// send/schedule -> persist) with classifyWorkerOutcome() for BOTH entry
// points. A transient infra failure (Redis unreachable, Graph API
// timeout/5xx, or anything unclassified) rethrows, so BullMQ's existing
// 3-attempt exponential backoff keeps retrying unchanged, for a scheduled
// fire exactly like a citizen turn. A business rejection resolves normally
// — the job completes, avoiding an infinite retry loop for a terminal,
// non-retriable stop.
//
// A factory, not a bare function (same shape as createShutdownHandler
// below): processConversationEvent needs the composition-root-built
// ConversationFlowService injected, and this codebase's convention is
// constructor injection over module mocks.
export function createProcessConversationEvent(
  deps: ProcessConversationEventDeps
): (job: Job<ConversationJobData>) => Promise<void> {
  const { conversationFlow } = deps;

  return async function processConversationEvent(job: Job<ConversationJobData>): Promise<void> {
    // D30/D31: a scheduled-check job is never an InboundConversationEvent —
    // routing it to conversationFlow.processScheduled() (never process())
    // keeps a timer fire from being mistaken for a citizen turn.
    if (isScheduledCheckJob(job.data)) {
      logger.info(
        { jobId: job.id, ...toScheduledCheckJobLogView(job.data) },
        "conversation-events scheduled-check job received"
      );

      try {
        await conversationFlow.processScheduled(job.data);
      } catch (err) {
        if (classifyWorkerOutcome(err) === "transient") throw err;

        logger.warn(
          { jobId: job.id, err },
          "conversation-events scheduled-check job resolved as a business rejection — no retry"
        );
      }
      return;
    }

    logger.info(
      { jobId: job.id, ...toLogView(job.data, { logHashSecret: config.logHashSecret }) },
      "conversation-events job received"
    );

    try {
      await conversationFlow.process(job.data);
    } catch (err) {
      if (classifyWorkerOutcome(err) === "transient") throw err;

      logger.warn(
        { jobId: job.id, err },
        "conversation-events job resolved as a business rejection — no retry"
      );
    }
  };
}

export interface ShutdownDeps {
  worker: Pick<Worker, "close">;
  connection: Pick<IORedis, "quit">;
  /**
   * D29/D30 (Phase 5): the scheduler owns its own Redis connection (mirrors
   * ConversationEventDao's own-connection discipline) — must be released on
   * shutdown too, same as `connection` above.
   */
  scheduler: Pick<ScheduledCheckScheduler, "close">;
}

// Idempotent, guarded against double-fire (SIGTERM and SIGINT could both
// arrive, or the same signal twice): stops fetching new jobs, awaits
// in-flight jobs via worker.close(), releases the scheduler's own
// connection, then releases the worker's own Redis connection.
export function createShutdownHandler(deps: ShutdownDeps): (signal: string) => Promise<void> {
  let shuttingDown = false;

  return async function shutdown(signal: string): Promise<void> {
    if (shuttingDown) return;
    shuttingDown = true;

    logger.info({ signal }, "Cerrando el worker de forma ordenada");
    try {
      await deps.worker.close();
      await deps.scheduler.close();
      await deps.connection.quit();
      process.exit(0);
    } catch (err) {
      logger.error({ err }, "Error durante el cierre ordenado del worker");
      process.exit(1);
    }
  };
}

// D32/Phase 5 (boot layer): the second wait's timer (design: "check #2 arms
// wait 2") fires at ~2 × citaRegistrationWaitSeconds after a session was
// first written — if sessionTtlSeconds is not comfortably above that, Redis
// could reap the session before the second timer ever fires, turning a
// legitimate wait into a silent D31 no-op (absent session) instead of the
// intended re-check. A boot-time assertion (same shape as assertRedisDriver
// above) catches a misconfigured deploy loudly instead of letting it
// degrade silently in production.
export function assertSchedulingTtlHeadroom(): void {
  const minimumTtlSeconds = 2 * config.citaRegistrationWaitSeconds;
  if (config.sessionTtlSeconds <= minimumTtlSeconds) {
    throw new Error(
      `[worker] SESSION_TTL_SECONDS (${config.sessionTtlSeconds}) debe ser mayor que ` +
        `2 × CITA_REGISTRATION_WAIT_SECONDS (${minimumTtlSeconds}) para que una sesión no expire ` +
        "antes de que el segundo aviso de registro pueda dispararse."
    );
  }
}

function startWorker(): void {
  assertRedisDriver();
  assertSchedulingTtlHeadroom();

  // BullMQ requires maxRetriesPerRequest: null for a Worker (unlike the
  // producer's 1) — it manages blocking-call retries itself.
  const connection = new IORedis(config.redisUrl, { maxRetriesPerRequest: null });

  // Composition root (D11-style, mirrors select-conversation-event-dao.ts):
  // constructs the driven adapters once, at process start, and injects them
  // into the service and job handler — never a module mock.
  const sessionStore = selectSessionStore({ config, logger });
  const sender = createMetaWhatsappSender({ config, logger });
  // D20/PR4 resequencing note: wiring this here (rather than Phase 7's
  // originally-listed task 7.5 slot) because createConversationFlowService
  // now requires reniecLookupClient to compile and work — same precedent as
  // Phase 3's reniecLookupBaseUrl resequencing.
  const reniecLookupClient = createHttpReniecLookupClient({ config, logger });
  // Phase 7 (PR7): the real QuejasSubmissionClient and WhatsappMediaDownloader,
  // completing the con-DNI/sin-DNI Reclamo flow end to end. D21 gate: code
  // built and unit-tested against fakes only, per explicit instruction — see
  // http-quejas-submission-client.ts's loud comment. Real-endpoint base64
  // acceptance validation is still pending before production traffic.
  const quejasSubmissionClient = createHttpQuejasSubmissionClient({ config, logger });
  const whatsappMediaDownloader = createMetaMediaDownloader({ config, logger });
  // Phase 5 (PR5): the real BullMQ-backed ScheduledCheckScheduler, own Redis
  // connection (mirrors every other adapter's own-connection discipline).
  // Constructed unconditionally so createConversationFlowService's
  // schedule_check executor never hits ScheduledCheckSchedulerNotConfiguredError
  // in production — same resequencing precedent as reniecLookupClient/
  // quejasSubmissionClient above.
  const scheduledCheckScheduler = createRedisScheduledCheckScheduler({ config, logger });
  // Phase 8 (PR8, final): the real HTTP-backed MinsaIdentityClient
  // (http-minsa-identity-client.ts, built and unit-tested against fakes
  // since Phase 3). Constructed unconditionally, same resequencing
  // precedent as reniecLookupClient/quejasSubmissionClient/
  // scheduledCheckScheduler above — minsaIdentityClient is now a REQUIRED
  // dependency of createConversationFlowService (conversation-flow.ts), so
  // this call site is the only place it can come from in production.
  const minsaIdentityClient = createHttpMinsaIdentityClient({ config, logger });
  // Cita catalog/booking MVP (no-SDD fast path): same resequencing precedent
  // as every other client above — minsaCatalogClient is a REQUIRED dependency
  // of createConversationFlowService.
  const minsaCatalogClient = createHttpMinsaCatalogClient({ config, logger });
  // AI ubigeo pre-check (no-SDD exploration, explicit user decision): the
  // production default is the no-op adapter (always "valid", i.e. a pure
  // pass-through) — the real Google AI adapter is only wired into the
  // sandbox composition for now (SANDBOX_USE_REAL_AI), not real traffic.
  const aiFallbackClient = createNoopAiFallbackClient();
  const conversationFlow = createConversationFlowService({
    sessionStore,
    sender,
    reniecLookupClient,
    quejasSubmissionClient,
    whatsappMediaDownloader,
    scheduledCheckScheduler,
    minsaIdentityClient,
    minsaCatalogClient,
    aiFallbackClient,
    config,
  });
  const processConversationEvent = createProcessConversationEvent({ conversationFlow });

  const worker = new Worker(CONVERSATION_QUEUE_NAME, processConversationEvent, { connection });

  worker.on("failed", (job, err) => {
    logger.error({ jobId: job?.id, err }, "conversation-events job failed");
  });
  worker.on("error", (err) => {
    logger.error({ err }, "conversation-events worker error");
  });

  const shutdown = createShutdownHandler({ worker, connection, scheduler: scheduledCheckScheduler });
  process.on("SIGTERM", () => void shutdown("SIGTERM"));
  process.on("SIGINT", () => void shutdown("SIGINT"));

  logger.info({ redisUrl: redactRedisUrl(config.redisUrl) }, "[worker] conversation-events worker iniciado");
}

// Only self-invokes when this file is the actual process entry point (`node
// dist/worker.js` / `tsx watch src/worker.ts`), not merely imported. Unlike
// server.ts, nothing in production ever imports worker.ts as a dependency —
// it is a standalone entrypoint — so this guard has no D1-style fragility
// concern: under vitest, process.argv[1] is the test runner's own script,
// never this file's path.
if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  startWorker();
}
