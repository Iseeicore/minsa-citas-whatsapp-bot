import { Queue } from "bullmq";
import { Redis as IORedis } from "ioredis";
import type pino from "pino";
import type { ConversationQueue } from "../ports/conversation-queue.js";

export interface RedisConversationQueueDeps {
  config: { redisUrl: string };
  logger: pino.Logger;
}

// Synchronous constructor: never connects-and-waits, never throws (D3). Redis
// unreachability — at boot or later — surfaces per-operation through add()
// rejecting; there is no boot-time probe and `mode` never downgrades.
//
// enableOfflineQueue:false makes a command issued while disconnected reject
// immediately instead of queuing and hanging the request until
// connectionTimeout. The retryStrategy is permanent (never null, unlike the
// old conversation-queue.ts's `() => null`) so the connection self-heals in
// the background without a restart once Redis comes back.
export function createRedisConversationQueue(deps: RedisConversationQueueDeps): ConversationQueue {
  const { config, logger } = deps;

  const connection = new IORedis(config.redisUrl, {
    maxRetriesPerRequest: 1,
    enableOfflineQueue: false,
    retryStrategy(times) {
      return Math.min(times * 500, 5000);
    },
  });

  // Guarded so a persistently-down Redis logs once, not once per failed
  // reconnect attempt.
  let hasLoggedError = false;
  connection.on("error", (err: Error) => {
    if (hasLoggedError) return;
    hasLoggedError = true;
    logger.error(
      { err, redisUrl: config.redisUrl },
      "[conversation-queue:redis] Error de conexión a Redis"
    );
  });
  connection.on("ready", () => {
    hasLoggedError = false;
    logger.info({ redisUrl: config.redisUrl }, "[conversation-queue:redis] Conectado a Redis");
  });

  const queue = new Queue("conversation-events", { connection });

  return {
    mode: "redis",
    async add(name, data) {
      // BullMQ's Queue.add() awaits its own internal "wait until ready" gate
      // (on the 'ready'/'end' ioredis events) before issuing the command —
      // enableOfflineQueue:false does NOT short-circuit this, it only governs
      // raw ioredis command queuing. With a permanent retryStrategy the
      // connection never reaches 'end', so without this guard add() would
      // hang forever instead of rejecting while Redis is down. Checking
      // status explicitly is what actually delivers "rejects at once".
      if (connection.status !== "ready") {
        throw new Error(
          `[conversation-queue:redis] Redis no está listo (status=${connection.status}); evento no encolado`
        );
      }

      await queue.add(name, data, {
        removeOnComplete: true,
        attempts: 3,
        backoff: { type: "exponential", delay: 2000 },
      });
    },
    async close() {
      await queue.close();
      connection.disconnect();
    },
  };
}
