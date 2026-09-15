import type pino from "pino";
import type { SessionStore } from "../ports/session-store.js";
import { createMemorySessionStore } from "../adapters/memory-session-store.js";
import { createRedisSessionStore } from "../adapters/redis-session-store.js";

export interface SelectSessionStoreDeps {
  config: {
    sessionStoreDriver?: string;
    nodeEnv?: string;
    redisUrl: string;
  };
  logger: pino.Logger;
}

const ALLOWED_DRIVERS = ["redis", "memory"] as const;

// Mirrors select-conversation-event-dao.ts exactly (D3 selection rules,
// same discipline as D11 in the design): fail at the earliest layer that can
// actually signal the failure.
//   - Redis unreachable: a runtime dependency state, has a working
//     per-request signal already (load/save/delete reject) — never blocks
//     boot.
//   - SESSION_STORE_DRIVER=memory in production: a deterministic config
//     error with NO runtime failure to surface (the memory adapter resolves)
//     — the only layer left is boot.
export function selectSessionStore(deps: SelectSessionStoreDeps): SessionStore {
  const { config, logger } = deps;
  const driver = config.sessionStoreDriver ?? "redis";

  if (driver !== "redis" && driver !== "memory") {
    throw new Error(
      `[select-session-store] Valor inválido para SESSION_STORE_DRIVER: "${driver}". ` +
        `Valores permitidos: ${ALLOWED_DRIVERS.join(", ")}.`
    );
  }

  if (driver === "memory") {
    if (config.nodeEnv === "production") {
      throw new Error(
        "[select-session-store] SESSION_STORE_DRIVER=memory no está permitido con NODE_ENV=production: " +
          "el almacén en memoria pierde sesiones entre reinicios y no soporta múltiples réplicas."
      );
    }

    logger.warn(
      "[select-session-store] Usando almacén de sesiones en memoria (SESSION_STORE_DRIVER=memory): un solo " +
        "proceso, sesiones se pierden al reiniciar. No usar con múltiples réplicas ni en producción."
    );
    return createMemorySessionStore({ logger });
  }

  // Redis adapter is synchronous and never throws (D3/D11) — Redis being
  // unreachable at this point does not prevent the server from starting.
  return createRedisSessionStore({ config, logger });
}
