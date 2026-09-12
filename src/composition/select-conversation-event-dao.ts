import type pino from "pino";
import type { ConversationEventDao } from "../ports/conversation-event-dao.js";
import { createMemoryConversationEventDao } from "../adapters/memory-conversation-event-dao.js";
import { createRedisConversationEventDao } from "../adapters/redis-conversation-event-dao.js";

export interface SelectConversationEventDaoDeps {
  config: {
    queueDriver?: string;
    nodeEnv?: string;
    redisUrl: string;
  };
  logger: pino.Logger;
}

const ALLOWED_DRIVERS = ["redis", "memory"] as const;

// D3 selection rules (unchanged by the D8 rename). Governing principle: fail
// at the earliest layer that can actually signal the failure.
//   - Redis unreachable: a runtime dependency state, has a working per-request
//     signal already (save() rejects -> existing 503) — never blocks boot.
//   - QUEUE_DRIVER=memory in production: a deterministic config error with NO
//     runtime failure to surface (the memory adapter's save() resolves) — the
//     only layer left is boot.
export function selectConversationEventDao(deps: SelectConversationEventDaoDeps): ConversationEventDao {
  const { config, logger } = deps;
  const driver = config.queueDriver ?? "redis";

  if (driver !== "redis" && driver !== "memory") {
    throw new Error(
      `[select-conversation-event-dao] Valor inválido para QUEUE_DRIVER: "${driver}". ` +
        `Valores permitidos: ${ALLOWED_DRIVERS.join(", ")}.`
    );
  }

  if (driver === "memory") {
    if (config.nodeEnv === "production") {
      throw new Error(
        "[select-conversation-event-dao] QUEUE_DRIVER=memory no está permitido con NODE_ENV=production: " +
          "la cola en memoria pierde eventos entre reinicios y no soporta múltiples réplicas."
      );
    }

    logger.warn(
      "[select-conversation-event-dao] Usando DAO en memoria (QUEUE_DRIVER=memory): un solo proceso, " +
        "eventos se pierden al reiniciar. No usar con múltiples réplicas ni en producción."
    );
    return createMemoryConversationEventDao({ logger });
  }

  // Redis adapter is synchronous and never throws (D3) — Redis being
  // unreachable at this point does not prevent the server from starting.
  return createRedisConversationEventDao({ config, logger });
}
