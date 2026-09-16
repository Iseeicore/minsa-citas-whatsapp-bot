import { Queue } from "bullmq";
import { Redis as IORedis } from "ioredis";
import type pino from "pino";
import type { ConversationEventDao } from "../ports/conversation-event-dao.js";
import type { InboundConversationEvent } from "../domain/inbound-conversation-event.js";
import { CONVERSATION_QUEUE_NAME } from "../domain/conversation-queue.js";

export interface RedisConversationEventDaoDeps {
  config: { redisUrl: string };
  logger: pino.Logger;
}

// A connection string commonly carries an embedded password (Upstash's
// rediss:// URLs are exactly this shape) — logging config.redisUrl directly
// leaks that credential in plaintext into every log sink. Keep only what's
// useful for debugging (protocol + host); never throw on a malformed value,
// since a logging helper must not be able to crash the caller it's serving.
export function redactRedisUrl(redisUrl: string): string {
  try {
    const url = new URL(redisUrl);
    return `${url.protocol}//${url.host}`;
  } catch {
    return "[redis url unparsable]";
  }
}

// Synchronous constructor: never connects-and-waits, never throws (D3). Redis
// unreachability — at boot or later — surfaces per-operation through save()
// rejecting; there is no boot-time probe and `mode` never downgrades.
//
// enableOfflineQueue:false makes a command issued while disconnected reject
// immediately instead of queuing and hanging the request until
// connectionTimeout. The retryStrategy is permanent (never null) so the
// connection self-heals in the background without a restart once Redis
// comes back.
export function createRedisConversationEventDao(deps: RedisConversationEventDaoDeps): ConversationEventDao {
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
      { err, redisUrl: redactRedisUrl(config.redisUrl) },
      "[conversation-event-dao:redis] Error de conexión a Redis"
    );
  });
  connection.on("ready", () => {
    hasLoggedError = false;
    logger.info({ redisUrl: redactRedisUrl(config.redisUrl) }, "[conversation-event-dao:redis] Conectado a Redis");
  });

  const queue = new Queue(CONVERSATION_QUEUE_NAME, { connection });

  return {
    mode: "redis",
    async save(event: InboundConversationEvent) {
      // BullMQ's Queue.add() awaits its own internal "wait until ready" gate
      // (on the 'ready'/'end' ioredis events) before issuing the command —
      // enableOfflineQueue:false does NOT short-circuit this, it only governs
      // raw ioredis command queuing. With a permanent retryStrategy the
      // connection never reaches 'end', so without this guard save() would
      // hang forever instead of rejecting while Redis is down. Checking
      // status explicitly is what actually delivers "rejects at once" (D3).
      if (connection.status !== "ready") {
        throw new Error(
          `[conversation-event-dao:redis] Redis no está listo (status=${connection.status}); evento no guardado`
        );
      }

      await queue.add(CONVERSATION_QUEUE_NAME, event, {
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
