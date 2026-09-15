import { afterEach, describe, expect, it, vi } from "vitest";

// config.ts reads process.env at module-load time (singleton), so each
// scenario needs vi.resetModules() + a fresh dynamic import to re-run its
// top-level readEnv() calls under different env conditions.
describe("config", () => {
  const originalSecret = process.env.META_APP_SECRET;
  const originalConnectionTimeout = process.env.CONNECTION_TIMEOUT_MS;
  const originalKeepAliveTimeout = process.env.KEEP_ALIVE_TIMEOUT_MS;
  const originalQueueDriver = process.env.QUEUE_DRIVER;
  const originalMetaGraphApiVersion = process.env.META_GRAPH_API_VERSION;

  afterEach(() => {
    process.env.META_APP_SECRET = originalSecret;
    process.env.CONNECTION_TIMEOUT_MS = originalConnectionTimeout;
    process.env.KEEP_ALIVE_TIMEOUT_MS = originalKeepAliveTimeout;
    process.env.QUEUE_DRIVER = originalQueueDriver;
    process.env.META_GRAPH_API_VERSION = originalMetaGraphApiVersion;
    vi.doUnmock("./logger.js");
    vi.doUnmock("dotenv/config");
    vi.resetModules();
  });

  it("falls back to a placeholder and warns via the shared logger, not console.warn, when META_APP_SECRET is unset", async () => {
    delete process.env.META_APP_SECRET;

    // config.ts's top-level `import "dotenv/config"` would otherwise reload
    // the developer's real local .env file and repopulate META_APP_SECRET
    // from it, defeating this test's "unset" precondition.
    vi.doMock("dotenv/config", () => ({}));

    const warn = vi.fn();
    vi.doMock("./logger.js", () => ({
      logger: { warn, info: vi.fn(), error: vi.fn() },
    }));

    const consoleWarnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});

    vi.resetModules();
    const { config } = await import("./config.js");

    expect(config.metaAppSecret).toBe("CHANGE_ME");
    expect(warn).toHaveBeenCalledTimes(1);
    expect(consoleWarnSpy).not.toHaveBeenCalled();

    consoleWarnSpy.mockRestore();
  });

  it("defaults connectionTimeout to 30000ms and keepAliveTimeout to 72000ms", async () => {
    delete process.env.CONNECTION_TIMEOUT_MS;
    delete process.env.KEEP_ALIVE_TIMEOUT_MS;

    vi.resetModules();
    const { config } = await import("./config.js");

    expect(config.connectionTimeout).toBe(30000);
    expect(config.keepAliveTimeout).toBe(72000);
  });

  it("overrides connectionTimeout and keepAliveTimeout from env vars", async () => {
    process.env.CONNECTION_TIMEOUT_MS = "5000";
    process.env.KEEP_ALIVE_TIMEOUT_MS = "9000";

    vi.resetModules();
    const { config } = await import("./config.js");

    expect(config.connectionTimeout).toBe(5000);
    expect(config.keepAliveTimeout).toBe(9000);
  });

  it("leaves queueDriver undefined when QUEUE_DRIVER is unset — a dumb passthrough, no default here", async () => {
    delete process.env.QUEUE_DRIVER;

    vi.resetModules();
    const { config } = await import("./config.js");

    expect(config.queueDriver).toBeUndefined();
  });

  it("passes QUEUE_DRIVER and NODE_ENV through unchanged when set", async () => {
    process.env.QUEUE_DRIVER = "memory";

    vi.resetModules();
    const { config } = await import("./config.js");

    expect(config.queueDriver).toBe("memory");
    expect(config.nodeEnv).toBe(process.env.NODE_ENV);
  });

  it("leaves sessionStoreDriver undefined when SESSION_STORE_DRIVER is unset — a dumb passthrough, no default here", async () => {
    delete process.env.SESSION_STORE_DRIVER;

    vi.resetModules();
    const { config } = await import("./config.js");

    expect(config.sessionStoreDriver).toBeUndefined();
  });

  it("passes SESSION_STORE_DRIVER through unchanged when set", async () => {
    process.env.SESSION_STORE_DRIVER = "memory";

    vi.resetModules();
    const { config } = await import("./config.js");

    expect(config.sessionStoreDriver).toBe("memory");

    delete process.env.SESSION_STORE_DRIVER;
  });

  it("logHashSecret falls back to metaAppSecret when LOG_HASH_SECRET is unset (D7)", async () => {
    delete process.env.LOG_HASH_SECRET;

    vi.resetModules();
    const { config } = await import("./config.js");

    expect(config.logHashSecret).toBe(config.metaAppSecret);
  });

  it("logHashSecret uses LOG_HASH_SECRET when set, independent of metaAppSecret", async () => {
    process.env.LOG_HASH_SECRET = "a-dedicated-log-hash-secret";

    vi.resetModules();
    const { config } = await import("./config.js");

    expect(config.logHashSecret).toBe("a-dedicated-log-hash-secret");
    expect(config.logHashSecret).not.toBe(config.metaAppSecret);

    delete process.env.LOG_HASH_SECRET;
  });

  it("defaults sessionTtlSeconds to 3600 when SESSION_TTL_SECONDS is unset", async () => {
    delete process.env.SESSION_TTL_SECONDS;

    vi.resetModules();
    const { config } = await import("./config.js");

    expect(config.sessionTtlSeconds).toBe(3600);
  });

  it("overrides sessionTtlSeconds from SESSION_TTL_SECONDS", async () => {
    process.env.SESSION_TTL_SECONDS = "1800";

    vi.resetModules();
    const { config } = await import("./config.js");

    expect(config.sessionTtlSeconds).toBe(1800);

    delete process.env.SESSION_TTL_SECONDS;
  });

  // D19: sessionKeySecret is a DEDICATED secret, deliberately NOT sharing
  // logHashSecret's fallback chain — a routine META_APP_SECRET rotation must
  // not silently orphan every live session.
  it("sessionKeySecret falls back to metaAppSecret when SESSION_KEY_SECRET is unset (D19)", async () => {
    delete process.env.SESSION_KEY_SECRET;

    vi.resetModules();
    const { config } = await import("./config.js");

    expect(config.sessionKeySecret).toBe(config.metaAppSecret);
  });

  it("sessionKeySecret uses SESSION_KEY_SECRET when set, independent of metaAppSecret and logHashSecret (D19)", async () => {
    process.env.SESSION_KEY_SECRET = "a-dedicated-session-key-secret";

    vi.resetModules();
    const { config } = await import("./config.js");

    expect(config.sessionKeySecret).toBe("a-dedicated-session-key-secret");
    expect(config.sessionKeySecret).not.toBe(config.metaAppSecret);
    expect(config.sessionKeySecret).not.toBe(config.logHashSecret);

    delete process.env.SESSION_KEY_SECRET;
  });

  // D16: readEnv(), no fallback — same discipline as metaAppSecret's own test
  // above. A missing Graph API version must warn and fail soft to
  // "CHANGE_ME" (loud 4xx at send time, classified transient by the Meta
  // adapter) rather than block the HTTP server from booting.
  it("metaGraphApiVersion falls back to a placeholder and warns when META_GRAPH_API_VERSION is unset (D16)", async () => {
    delete process.env.META_GRAPH_API_VERSION;

    // Same isolation concern as the META_APP_SECRET test: config.ts's
    // top-level `import "dotenv/config"` would otherwise reload the
    // developer's real local .env file and repopulate this var from it.
    vi.doMock("dotenv/config", () => ({}));

    const warn = vi.fn();
    vi.doMock("./logger.js", () => ({
      logger: { warn, info: vi.fn(), error: vi.fn() },
    }));

    vi.resetModules();
    const { config } = await import("./config.js");

    expect(config.metaGraphApiVersion).toBe("CHANGE_ME");
    expect(warn).toHaveBeenCalledTimes(1);
  });

  it("metaGraphApiVersion passes through META_GRAPH_API_VERSION unchanged when set", async () => {
    process.env.META_GRAPH_API_VERSION = "v21.0";

    vi.resetModules();
    const { config } = await import("./config.js");

    expect(config.metaGraphApiVersion).toBe("v21.0");
  });

  // D32 (Stage C1, PR5)
  it("defaults citaRegistrationWaitSeconds to 300 when CITA_REGISTRATION_WAIT_SECONDS is unset", async () => {
    delete process.env.CITA_REGISTRATION_WAIT_SECONDS;

    vi.resetModules();
    const { config } = await import("./config.js");

    expect(config.citaRegistrationWaitSeconds).toBe(300);
  });

  it("overrides citaRegistrationWaitSeconds from CITA_REGISTRATION_WAIT_SECONDS", async () => {
    process.env.CITA_REGISTRATION_WAIT_SECONDS = "120";

    vi.resetModules();
    const { config } = await import("./config.js");

    expect(config.citaRegistrationWaitSeconds).toBe(120);

    delete process.env.CITA_REGISTRATION_WAIT_SECONDS;
  });
});
