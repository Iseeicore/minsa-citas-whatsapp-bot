// Deterministic env vars set before any module (notably src/config.ts) is
// imported. config.ts reads process.env at module-load time as a singleton,
// so setupFiles is the only place that reliably runs first.
process.env.META_APP_SECRET = "test-meta-app-secret";
process.env.META_WEBHOOK_VERIFY_TOKEN = "test-webhook-verify-token";
process.env.META_ACCESS_TOKEN = "test-meta-access-token";
process.env.META_PHONE_NUMBER_ID = "test-phone-number-id";
process.env.MINSA_INTEGRATION_SECRET = "test-minsa-integration-secret";
process.env.MINSA_API_HOST = "https://minsa.example.test/back";
process.env.REDIS_URL = "redis://127.0.0.1:6399";
process.env.PORT = "3000";
