import type pino from "pino";
import type { ConversationQueue } from "../ports/conversation-queue.js";
import { createMemoryConversationQueue } from "../adapters/memory-conversation-queue.js";
import { createRedisConversationQueue } from "../adapters/redis-conversation-queue.js";

export interface SelectConversationQueueDeps {
  config: {
    queueDriver?: string;
    nodeEnv?: string;
    redisUrl: string;
  };
  logger: pino.Logger;
}

const ALLOWED_DRIVERS = ["redis", "memory"] as const;

// D3 selection rules. Governing principle: fail at the earliest layer that
// can actually signal the failure.
//   - Redis unreachable: a runtime dependency state, has a working per-request
//     signal already (add() rejects -> existing 503) — never blocks boot.
//   - QUEUE_DRIVER=memory in production: a deterministic config error with NO
//     runtime failure to surface (the memory adapter's add() resolves) — the
//     only layer left is boot.
export function selectConversationQueue(deps: SelectConversationQueueDeps): ConversationQueue {
  const { config, logger } = deps;
  const driver = config.queueDriver ?? "redis";

  if (driver !== "redis" && driver !== "memory") {
    throw new Error(
      `[select-conversation-queue] Valor inválido para QUEUE_DRIVER: "${driver}". ` +
        `Valores permitidos: ${ALLOWED_DRIVERS.join(", ")}.`
    );
  }

  if (driver === "memory") {
    if (config.nodeEnv === "production") {
      throw new Error(
        "[select-conversation-queue] QUEUE_DRIVER=memory no está permitido con NODE_ENV=production: " +
          "la cola en memoria pierde eventos entre reinicios y no soporta múltiples réplicas."
      );
    }

    logger.warn(
      "[select-conversation-queue] Usando cola en memoria (QUEUE_DRIVER=memory): un solo proceso, " +
        "eventos se pierden al reiniciar. No usar con múltiples réplicas ni en producción."
    );
    return createMemoryConversationQueue({ logger });
  }

  // Redis adapter is synchronous and never throws (D3) — Redis being
  // unreachable at this point does not prevent the server from starting.
  return createRedisConversationQueue({ config, logger });
}
