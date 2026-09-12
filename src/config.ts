import "dotenv/config";
import { logger } from "./logger.js";

function readEnv(name: string, fallback?: string): string {
  const value = process.env[name] ?? fallback;
  if (!value) {
    logger.warn(
      `[config] Falta la variable de entorno ${name} — usando placeholder "CHANGE_ME". ` +
        `Completala en .env antes de procesar mensajes reales.`
    );
    return "CHANGE_ME";
  }
  return value;
}

const metaAppSecret = readEnv("META_APP_SECRET");

export const config = {
  port: Number(process.env.PORT ?? 3000),
  metaAppSecret,
  metaWebhookVerifyToken: readEnv("META_WEBHOOK_VERIFY_TOKEN"),
  metaAccessToken: readEnv("META_ACCESS_TOKEN"),
  metaPhoneNumberId: readEnv("META_PHONE_NUMBER_ID"),
  minsaApiHost: process.env.MINSA_API_HOST ?? "https://dminsadigital.minsa.gob.pe/back",
  minsaIntegrationSecret: readEnv("MINSA_INTEGRATION_SECRET"),
  redisUrl: process.env.REDIS_URL ?? "redis://127.0.0.1:6379",
  // D7: dedicated secret for the log-view HMAC fingerprint. Falls back to
  // metaAppSecret when unset — accepted consequence: rotating the app
  // secret re-keys the fingerprints, breaking correlation across rotation.
  logHashSecret: process.env.LOG_HASH_SECRET ?? metaAppSecret,
  // Dumb passthrough, no defaulting — validation belongs to the composition
  // root (src/composition/select-conversation-event-dao.ts), not this module.
  queueDriver: process.env.QUEUE_DRIVER,
  nodeEnv: process.env.NODE_ENV,
  // Fastify defaults connectionTimeout to 0 (unbounded); 30s bounds a hung
  // socket while staying far above any legitimate Meta webhook delivery.
  connectionTimeout: Number(process.env.CONNECTION_TIMEOUT_MS ?? 30000),
  // Must exceed the upstream load balancer's idle timeout (commonly 60s) or
  // keep-alive races produce spurious 502s; 72s is Fastify's own default,
  // made explicit here per this change's success criteria.
  keepAliveTimeout: Number(process.env.KEEP_ALIVE_TIMEOUT_MS ?? 72000),
};
