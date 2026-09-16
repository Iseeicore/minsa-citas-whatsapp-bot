import { Redis as IORedis } from "ioredis";
import type pino from "pino";
import type { SessionStore } from "../ports/session-store.js";
import type { ConversationSession } from "../domain/conversation-session.js";
import { redactRedisUrl } from "./redis-conversation-event-dao.js";

export interface RedisSessionStoreDeps {
  config: { redisUrl: string };
  logger: pino.Logger;
}

// D11: the key prefix. `digest` is the D17 sessionKey — a 64-hex HMAC, never
// the raw MSISDN.
const KEY_PREFIX = "session:wa:";

function keyFor(sessionKey: string): string {
  return `${KEY_PREFIX}${sessionKey}`;
}

// D11: own ioredis connection, separate from ConversationEventDao's — a
// separate connection keeps producer, worker, and session lifecycles
// independent (boot must never depend on Redis, D3). Same
// enableOfflineQueue:false / permanent retryStrategy / explicit
// status!=="ready" guard discipline as redis-conversation-event-dao.ts: that
// guard is what actually delivers "rejects at once" instead of hanging,
// because BullMQ's internal ready-gate has no equivalent here — a raw
// ioredis command with enableOfflineQueue:false rejects synchronously on a
// disconnected client, but only once ioredis itself has given up retrying
// the in-flight command, so the explicit guard keeps the failure immediate
// and independent of that internal timing.
export function createRedisSessionStore(deps: RedisSessionStoreDeps): SessionStore {
  const { config, logger } = deps;

  const connection = new IORedis(config.redisUrl, {
    maxRetriesPerRequest: 1,
    enableOfflineQueue: false,
    retryStrategy(times) {
      return Math.min(times * 500, 5000);
    },
  });

  // Guarded so a persistently-down Redis logs once, not once per failed
  // reconnect attempt (same discipline as redis-conversation-event-dao.ts).
  let hasLoggedError = false;
  connection.on("error", (err: Error) => {
    if (hasLoggedError) return;
    hasLoggedError = true;
    logger.error({ err, redisUrl: redactRedisUrl(config.redisUrl) }, "[session-store:redis] Error de conexión a Redis");
  });
  connection.on("ready", () => {
    hasLoggedError = false;
    logger.info({ redisUrl: redactRedisUrl(config.redisUrl) }, "[session-store:redis] Conectado a Redis");
  });

  function assertReady(): void {
    if (connection.status !== "ready") {
      throw new Error(`[session-store:redis] Redis no está listo (status=${connection.status}); operación rechazada`);
    }
  }

  return {
    mode: "redis",
    async load(sessionKey: string) {
      assertReady();
      const raw = await connection.get(keyFor(sessionKey));
      if (raw === null) return null;
      return JSON.parse(raw) as ConversationSession;
    },
    async save(session: ConversationSession) {
      assertReady();
      await connection.set(keyFor(session.sessionKey), JSON.stringify(session), "EX", session.ttlSeconds);
    },
    async delete(sessionKey: string) {
      assertReady();
      await connection.del(keyFor(sessionKey));
    },
    async close() {
      connection.disconnect();
    },
  };
}
