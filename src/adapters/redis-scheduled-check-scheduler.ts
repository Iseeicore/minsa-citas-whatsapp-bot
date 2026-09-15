import { Queue } from "bullmq";
import { Redis as IORedis } from "ioredis";
import type pino from "pino";
import type { ScheduledCheckScheduler } from "../ports/scheduled-check-scheduler.js";
import type { ScheduledCheckJobData } from "../domain/conversation-job.js";
import { CONVERSATION_QUEUE_NAME } from "../domain/conversation-queue.js";
import { redactRedisUrl } from "./redis-conversation-event-dao.js";

export interface RedisScheduledCheckSchedulerDeps {
  config: { redisUrl: string };
  logger: pino.Logger;
}

// D29/D30/D31 (Stage C1, PR5): the real BullMQ-backed ScheduledCheckScheduler
// adapter — the sole executor of a `schedule_check` effect
// (conversation-flow.ts's runScheduleEffects). Mirrors
// redis-conversation-event-dao.ts's exact discipline: own IORedis
// connection, own Queue(CONVERSATION_QUEUE_NAME) — the SAME queue name the
// inbound producer/worker already share (D30: one queue, one discriminated
// payload, no second Queue/Worker pair). Synchronous constructor, never
// throws (D3): Redis unreachability surfaces per-call through schedule()
// rejecting, never at boot.
export function createRedisScheduledCheckScheduler(deps: RedisScheduledCheckSchedulerDeps): ScheduledCheckScheduler {
  const { config, logger } = deps;

  const connection = new IORedis(config.redisUrl, {
    maxRetriesPerRequest: 1,
    enableOfflineQueue: false,
    retryStrategy(times) {
      return Math.min(times * 500, 5000);
    },
  });

  // Guarded so a persistently-down Redis logs once, not once per failed
  // reconnect attempt (same discipline as the other two Redis adapters).
  let hasLoggedError = false;
  connection.on("error", (err: Error) => {
    if (hasLoggedError) return;
    hasLoggedError = true;
    logger.error(
      { err, redisUrl: redactRedisUrl(config.redisUrl) },
      "[scheduled-check-scheduler:redis] Error de conexión a Redis"
    );
  });
  connection.on("ready", () => {
    hasLoggedError = false;
    logger.info(
      { redisUrl: redactRedisUrl(config.redisUrl) },
      "[scheduled-check-scheduler:redis] Conectado a Redis"
    );
  });

  const queue = new Queue(CONVERSATION_QUEUE_NAME, { connection });

  return {
    async schedule(data: ScheduledCheckJobData, delaySeconds: number): Promise<void> {
      // Same D3 guard as redis-conversation-event-dao.ts's save(): BullMQ's
      // own internal "wait until ready" gate does NOT short-circuit under
      // enableOfflineQueue:false with a permanent retryStrategy — without
      // this explicit check, schedule() would hang instead of rejecting
      // while Redis is down.
      if (connection.status !== "ready") {
        throw new Error(
          `[scheduled-check-scheduler:redis] Redis no está listo (status=${connection.status}); job de verificación no programado`
        );
      }

      await queue.add(CONVERSATION_QUEUE_NAME, data, {
        delay: Math.round(delaySeconds * 1000),
        removeOnComplete: true,
        attempts: 3,
        backoff: { type: "exponential", delay: 2000 },
      });
    },
    async close(): Promise<void> {
      await queue.close();
      connection.disconnect();
    },
  };
}
