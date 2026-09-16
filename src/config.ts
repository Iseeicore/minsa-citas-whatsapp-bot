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
  // D16: readEnv(), no sensible default — an unset version is a loud,
  // harmless failure (a Meta 4xx at send time, classified transient by
  // meta-whatsapp-sender.ts, dead-lettered after 3 attempts), not a reason to
  // block the HTTP server from booting.
  metaGraphApiVersion: readEnv("META_GRAPH_API_VERSION"),
  minsaApiHost: process.env.MINSA_API_HOST ?? "https://dminsadigital.minsa.gob.pe/back",
  // D25: bare process.env with a prod default, same discipline as
  // minsaApiHost above — RENIEC lookup needs no secret and no auth, so
  // readEnv()'s "CHANGE_ME" warning would be noise. Resequenced here from
  // its original Phase 7 task slot because PR3 (the RENIEC HTTP client)
  // needs it to compile and work, same as Stage A's PR2 did for its own
  // deferred config fields.
  reniecLookupBaseUrl: process.env.RENIEC_LOOKUP_BASE_URL ?? "https://back.personeros360.pe",
  // D25: same discipline as reniecLookupBaseUrl above — bare process.env
  // with a prod default, not readEnv(). The quejas submission endpoint needs
  // no secret and no auth, so readEnv()'s "CHANGE_ME" warning would be
  // noise. This is Phase 7's own remaining config task (7.4) — unlike
  // reniecLookupBaseUrl, it was not resequenced into an earlier PR.
  quejasApiBaseUrl:
    process.env.QUEJAS_API_BASE_URL ?? "https://back-end-ministerioescucha-production.up.railway.app",
  minsaIntegrationSecret: readEnv("MINSA_INTEGRATION_SECRET"),
  // AI fallback exploration (no-SDD, pre-architecture spike): a secret, so
  // readEnv()'s "CHANGE_ME" fallback + warning apply — same discipline as
  // minsaIntegrationSecret above.
  googleClientApiKey: readEnv("GOOGLE_CLIENT_API"),
  // Bare env, not a secret — the model id is public information. Default is
  // a widely-available fast/cheap Gemini model; override if the account's
  // key doesn't have access to it (GET /v1beta/models — the connectivity
  // check's own endpoint — lists what's actually available).
  googleAiModel: process.env.GOOGLE_AI_MODEL ?? "gemini-2.0-flash",
  // MVP (no-SDD fast path): swaps the sandbox's no-op AiFallbackClient
  // (ubigeo AI pre-check always reports "valid", i.e. a pass-through) for
  // the real Google AI adapter. Bare env, default false — same discipline
  // as the other SANDBOX_USE_REAL_* toggles: fake unless explicitly opted in.
  sandboxUseRealAi: process.env.SANDBOX_USE_REAL_AI === "true",
  // D32: bare process.env, not readEnv() — same discipline as minsaApiHost
  // above. Not a secret, so readEnv()'s "CHANGE_ME" warning would be noise.
  // The literal default is the confirmed original Twilio value (mem obs
  // #254) — an unset env behaves identically to the working original.
  citaConversationIdPlaceholder:
    process.env.MINSA_CONVERSATION_ID_PLACEHOLDER ?? "550e8400-e29b-41d4-a716-446655440000",
  // D32: bare process.env, not readEnv() — same discipline as
  // citaConversationIdPlaceholder above. Not a secret, so an unset env
  // silently takes the proven 300s default rather than warning.
  citaRegistrationWaitSeconds: Number(process.env.CITA_REGISTRATION_WAIT_SECONDS ?? 300),
  // D41: bare process.env, not readEnv() — a safe local default (unlike the
  // secrets above) is fine for dev. May carry an embedded credential
  // (Upstash's rediss:// URLs), same shape redactRedisUrl() already guards
  // against at every logging call site — secrecy is enforced there, not here.
  redisUrl: process.env.REDIS_URL ?? "redis://127.0.0.1:6379",
  // D7: dedicated secret for the log-view HMAC fingerprint. Falls back to
  // metaAppSecret when unset — accepted consequence: rotating the app
  // secret re-keys the fingerprints, breaking correlation across rotation.
  logHashSecret: process.env.LOG_HASH_SECRET ?? metaAppSecret,
  // D16: bare env read (like connectionTimeout/keepAliveTimeout above), not
  // readEnv() — a missing TTL should silently take the default, not warn.
  sessionTtlSeconds: Number(process.env.SESSION_TTL_SECONDS ?? 3600),
  // D19: dedicated secret, deliberately NOT readEnv() and NOT sharing
  // logHashSecret's fallback chain. readEnv()'s "CHANGE_ME" placeholder would
  // make the session-key HMAC effectively unkeyed (the MSISDN space is
  // brute-forceable); metaAppSecret guarantees a real secret even when
  // unset. Reusing logHashSecret directly would mean a routine META_APP_SECRET
  // rotation instantly orphans every live session with no deliberate intent.
  sessionKeySecret: process.env.SESSION_KEY_SECRET ?? metaAppSecret,
  // Dumb passthrough, no defaulting — validation belongs to the composition
  // root (src/composition/select-conversation-event-dao.ts), not this module.
  queueDriver: process.env.QUEUE_DRIVER,
  // Same discipline as queueDriver above: dumb passthrough, no defaulting —
  // validation belongs to the composition root
  // (src/composition/select-session-store.ts), not this module.
  sessionStoreDriver: process.env.SESSION_STORE_DRIVER,
  nodeEnv: process.env.NODE_ENV,
  // SBX-6 / D33: bare env read, fail-closed default false — same discipline
  // as queueDriver / sessionStoreDriver above (dumb passthrough, no
  // defaulting). The sandbox route is registered ONLY when this is exactly
  // "true" AND nodeEnv !== "production" (gate lives in src/app.ts, D33).
  sandboxEnabled: process.env.SANDBOX_ENABLED === "true",
  // MVP (no-SDD fast path): the frontend (minsa-traspaso-frontend, Vite dev
  // server) calls /sandbox/events directly from the browser — needs CORS.
  // Bare env, prod default irrelevant (this only ever registers inside the
  // sandboxEnabled && !production gate in app.ts).
  sandboxAllowedOrigin: process.env.SANDBOX_ALLOWED_ORIGIN ?? "http://localhost:5173",
  // MVP (no-SDD fast path): swaps the sandbox's fake MinsaIdentityClient/
  // MinsaCatalogClient for the REAL HTTP adapters (real MINSA_INTEGRATION_SECRET,
  // real network calls) while everything else in the sandbox (sender,
  // RENIEC, quejas, media) stays faked — lets the DNI/OTP/booking flow be
  // tested against production MINSA data without needing Meta credentials.
  // Bare env, default false — the sandbox is fake-only unless explicitly
  // opted into real MINSA calls.
  sandboxUseRealMinsa: process.env.SANDBOX_USE_REAL_MINSA === "true",
  // MVP (no-SDD fast path): swaps the sandbox's fake ReniecLookupClient for
  // the real HTTP adapter (real network call to personeros360.pe) — separate
  // from sandboxUseRealMinsa because RENIEC is an unrelated third-party
  // system. Safe to default on more freely than the MINSA toggle (it's a
  // read-only lookup, no OTP/SMS side effect), but kept as its own explicit
  // opt-in for the same discipline: the sandbox is fake-only by default.
  sandboxUseRealReniec: process.env.SANDBOX_USE_REAL_RENIEC === "true",
  // Fastify defaults connectionTimeout to 0 (unbounded); 30s bounds a hung
  // socket while staying far above any legitimate Meta webhook delivery.
  connectionTimeout: Number(process.env.CONNECTION_TIMEOUT_MS ?? 30000),
  // Must exceed the upstream load balancer's idle timeout (commonly 60s) or
  // keep-alive races produce spurious 502s; 72s is Fastify's own default,
  // made explicit here per this change's success criteria.
  keepAliveTimeout: Number(process.env.KEEP_ALIVE_TIMEOUT_MS ?? 72000),
};
