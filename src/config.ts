import "dotenv/config";

function readEnv(name: string, fallback?: string): string {
  const value = process.env[name] ?? fallback;
  if (!value) {
    console.warn(
      `[config] Falta la variable de entorno ${name} — usando placeholder "CHANGE_ME". ` +
        `Completala en .env antes de procesar mensajes reales.`
    );
    return "CHANGE_ME";
  }
  return value;
}

export const config = {
  port: Number(process.env.PORT ?? 3000),
  metaAppSecret: readEnv("META_APP_SECRET"),
  metaWebhookVerifyToken: readEnv("META_WEBHOOK_VERIFY_TOKEN"),
  metaAccessToken: readEnv("META_ACCESS_TOKEN"),
  metaPhoneNumberId: readEnv("META_PHONE_NUMBER_ID"),
  minsaApiHost: process.env.MINSA_API_HOST ?? "https://dminsadigital.minsa.gob.pe/back",
  minsaIntegrationSecret: readEnv("MINSA_INTEGRATION_SECRET"),
  redisUrl: process.env.REDIS_URL ?? "redis://127.0.0.1:6379",
};
