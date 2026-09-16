// Deterministic env vars set before any module (notably src/config.ts) is
// imported. config.ts reads process.env at module-load time as a singleton,
// so setupFiles is the only place that reliably runs first.
process.env.META_APP_SECRET = "test-meta-app-secret";
process.env.META_WEBHOOK_VERIFY_TOKEN = "test-webhook-verify-token";
process.env.META_ACCESS_TOKEN = "test-meta-access-token";
process.env.META_PHONE_NUMBER_ID = "test-phone-number-id";
process.env.META_GRAPH_API_VERSION = "v21.0";
process.env.MINSA_INTEGRATION_SECRET = "test-minsa-integration-secret";
process.env.MINSA_API_HOST = "https://minsa.example.test/back";
process.env.REDIS_URL = "redis://127.0.0.1:6399";
process.env.PORT = "3000";
// Bug fix: sandbox tests import the real config.js singleton, which reads
// process.env at module-load time — without pinning these here, the
// developer's own .env (e.g. SANDBOX_USE_REAL_RENIEC=true / SANDBOX_USE_
// REAL_MINSA=true, set for manual live testing) leaked into the test suite,
// making "fake" sandbox scenarios silently make real network calls.
process.env.SANDBOX_USE_REAL_MINSA = "false";
process.env.SANDBOX_USE_REAL_RENIEC = "false";
