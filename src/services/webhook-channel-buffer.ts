// Webhook channel viewer (no-SDD fast path, explicit user decision): so a
// human can see real inbound WhatsApp messages and reply manually from a
// frontend viewer — PARALLEL to the existing bot pipeline
// (/webhook/whatsapp -> ingestion.ingest() -> BullMQ -> worker.ts), which is
// untouched by this module.
//
// Originally a plain module-scope array — confirmed BROKEN on Vercel by a
// direct curl test: a message logged as received on one serverless instance
// was invisible to a GET on another, because Vercel can keep multiple
// instances warm concurrently and each held its own copy of that array. Now
// backed by a Redis list (RPUSH/LTRIM/LRANGE) so every instance shares the
// same store. Still deliberately simple relative to a real message queue —
// no delivery guarantees beyond Redis's own, no backpressure handling — that
// bar (durable and shared, not transactional) is sufficient for a
// human-operated viewer.
//
// Bare module functions, not a create...(deps) factory like
// redis-conversation-event-dao.ts/redis-session-store.ts: those are wired
// through AppDeps/buildApp/buildDefaultDeps and server.ts's graceful
// shutdown; this module was never part of that composition (webhook-channel.ts
// and whatsapp-webhook.ts already import it as bare functions), and adding
// that wiring would be real effort for no functional benefit, against this
// feature's established simplicity. Reads `config` via a direct top-level
// import, same precedent whatsapp-webhook.ts already sets for metaAppSecret.
import { Redis as IORedis } from "ioredis";
import { config } from "../config.js";
import { redactRedisUrl } from "../adapters/redis-conversation-event-dao.js";
import { logger } from "../logger.js";
import { QueueUnavailableError } from "../domain/errors.js";

export interface WebhookChannelMessage {
  readonly id: string;
  readonly direction: "in" | "out";
  readonly from?: string;
  readonly to?: string;
  readonly text: string;
  readonly timestamp: string;
}

const MAX_BUFFER_SIZE = 200;
const REDIS_KEY = "webhook-channel:messages";

// Own ioredis connection, separate from ConversationEventDao's/session
// store's — same discipline as those adapters (D11: independent lifecycles).
const connection = new IORedis(config.redisUrl, {
  maxRetriesPerRequest: 1,
  enableOfflineQueue: false,
  retryStrategy(times) {
    return Math.min(times * 500, 5000);
  },
});

let hasLoggedError = false;
connection.on("error", (err: Error) => {
  if (hasLoggedError) return;
  hasLoggedError = true;
  logger.error({ err, redisUrl: redactRedisUrl(config.redisUrl) }, "[webhook-channel-buffer:redis] Error de conexión a Redis");
});
connection.on("ready", () => {
  hasLoggedError = false;
  logger.info({ redisUrl: redactRedisUrl(config.redisUrl) }, "[webhook-channel-buffer:redis] Conectado a Redis");
});

// A bare Error here would fall through error-handler.ts's instanceof mapping
// to a generic 500 "internal_error" — QueueUnavailableError is what the
// handler already knows to map to 503 "service_unavailable", the same
// diagnostic shape the bot's own queue-down case gets.
function assertReady(): void {
  if (connection.status !== "ready") {
    throw new QueueUnavailableError(
      `[webhook-channel-buffer:redis] Redis no está listo (status=${connection.status}); operación rechazada`
    );
  }
}

export async function pushMessage(entry: WebhookChannelMessage): Promise<void> {
  assertReady();
  await connection.rpush(REDIS_KEY, JSON.stringify(entry));
  await connection.ltrim(REDIS_KEY, -MAX_BUFFER_SIZE, -1);
}

export async function getMessages(): Promise<readonly WebhookChannelMessage[]> {
  assertReady();
  const raw = await connection.lrange(REDIS_KEY, 0, -1);
  return raw.map((item) => JSON.parse(item) as WebhookChannelMessage);
}

// Test-only: mirrors vercel-handler.ts's resetVercelHandlerCache — module
// state must be resettable between tests, or one test's messages leak into
// the next.
export async function resetWebhookChannelBuffer(): Promise<void> {
  assertReady();
  await connection.del(REDIS_KEY);
}
