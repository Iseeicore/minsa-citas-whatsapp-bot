import { fileURLToPath } from "node:url";
import { Worker, type Job } from "bullmq";
import { Redis as IORedis } from "ioredis";
import { config } from "./config.js";
import { logger } from "./logger.js";
import type { InboundConversationEvent } from "./domain/inbound-conversation-event.js";

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

// No business logic yet — change 3 owns MINSA/domain processing. Resolving
// normally (not throwing) is required so removeOnComplete clears the job; a
// throwing placeholder would exercise the 3-attempt exponential backoff
// forever.
//
// D6: job.data is now the typed InboundConversationEvent Entity, not an
// untyped payload — the mapper runs once, in the ingestion service, so the
// worker reads an already-well-formed event instead of re-parsing. The log
// line here still logs job identity only (name/attemptsMade); PR7 (D7)
// switches it to the sanitized logging DTO instead of touching job.data
// directly.
export async function processConversationEvent(job: Job<InboundConversationEvent>): Promise<void> {
  logger.info(
    { jobId: job.id, name: job.name, attemptsMade: job.attemptsMade },
    "conversation-events job received"
  );
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
