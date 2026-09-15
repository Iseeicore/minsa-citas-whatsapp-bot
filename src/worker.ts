import { fileURLToPath } from "node:url";
import { Worker, type Job } from "bullmq";
import { Redis as IORedis } from "ioredis";
import { config } from "./config.js";
import { logger } from "./logger.js";
import type { InboundConversationEvent } from "./domain/inbound-conversation-event.js";
import { toLogView } from "./domain/inbound-conversation-event-log-view.js";
import { classifyWorkerOutcome } from "./domain/worker-outcome.js";
import type { ConversationFlowService } from "./services/conversation-flow.js";
import { createConversationFlowService } from "./services/conversation-flow.js";
import { selectSessionStore } from "./composition/select-session-store.js";
import { createMetaWhatsappSender } from "./adapters/meta-whatsapp-sender.js";
import { createHttpReniecLookupClient } from "./adapters/http-reniec-lookup-client.js";

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

// D6: job.data is the typed InboundConversationEvent Entity, not an untyped
// payload — the mapper runs once, in the ingestion service, so the worker
// reads an already-well-formed event instead of re-parsing. D7: logs the
// sanitized log-view DTO, never job.data directly — job.data carries the
// MSISDN and message body.
//
// D14: wraps conversation-flow's single I/O pipeline (load -> handle ->
// send -> persist) with classifyWorkerOutcome(). A transient infra failure
// (Redis unreachable, Graph API timeout/5xx, or anything unclassified)
// rethrows, so BullMQ's existing 3-attempt exponential backoff keeps
// retrying unchanged. A business rejection resolves normally — the job
// completes, avoiding an infinite retry loop for a terminal, non-retriable
// stop.
//
// A factory, not a bare function (same shape as createShutdownHandler
// below): processConversationEvent needs the composition-root-built
// ConversationFlowService injected, and this codebase's convention is
// constructor injection over module mocks.
export function createProcessConversationEvent(
  deps: ProcessConversationEventDeps
): (job: Job<InboundConversationEvent>) => Promise<void> {
  const { conversationFlow } = deps;

  return async function processConversationEvent(job: Job<InboundConversationEvent>): Promise<void> {
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
}

// Idempotent, guarded against double-fire (SIGTERM and SIGINT could both
// arrive, or the same signal twice): stops fetching new jobs, awaits
// in-flight jobs via worker.close(), then releases the Redis connection.
export function createShutdownHandler(deps: ShutdownDeps): (signal: string) => Promise<void> {
  let shuttingDown = false;

  return async function shutdown(signal: string): Promise<void> {
    if (shuttingDown) return;
    shuttingDown = true;

    logger.info({ signal }, "Cerrando el worker de forma ordenada");
    try {
      await deps.worker.close();
      await deps.connection.quit();
      process.exit(0);
    } catch (err) {
      logger.error({ err }, "Error durante el cierre ordenado del worker");
      process.exit(1);
    }
  };
}

function startWorker(): void {
  assertRedisDriver();

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
  // Phase 3's reniecLookupBaseUrl resequencing. Phase 7 still owns
  // WhatsappMediaDownloader + the (D21-gated) QuejasSubmissionClient wiring.
  const reniecLookupClient = createHttpReniecLookupClient({ config, logger });
  const conversationFlow = createConversationFlowService({ sessionStore, sender, reniecLookupClient, config });
  const processConversationEvent = createProcessConversationEvent({ conversationFlow });

  const worker = new Worker("conversation-events", processConversationEvent, { connection });

  worker.on("failed", (job, err) => {
    logger.error({ jobId: job?.id, err }, "conversation-events job failed");
  });
  worker.on("error", (err) => {
    logger.error({ err }, "conversation-events worker error");
  });

  const shutdown = createShutdownHandler({ worker, connection });
  process.on("SIGTERM", () => void shutdown("SIGTERM"));
  process.on("SIGINT", () => void shutdown("SIGINT"));

  logger.info({ redisUrl: config.redisUrl }, "[worker] conversation-events worker iniciado");
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
