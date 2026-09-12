import { afterEach, describe, expect, it, vi } from "vitest";

// config.ts reads process.env at module-load time (singleton), so each
// scenario needs vi.resetModules() + a fresh dynamic import to re-run its
// top-level readEnv() calls under different env conditions.
describe("config", () => {
  const originalSecret = process.env.META_APP_SECRET;
  const originalConnectionTimeout = process.env.CONNECTION_TIMEOUT_MS;
  const originalKeepAliveTimeout = process.env.KEEP_ALIVE_TIMEOUT_MS;
  const originalQueueDriver = process.env.QUEUE_DRIVER;

  afterEach(() => {
    process.env.META_APP_SECRET = originalSecret;
    process.env.CONNECTION_TIMEOUT_MS = originalConnectionTimeout;
    process.env.KEEP_ALIVE_TIMEOUT_MS = originalKeepAliveTimeout;
    process.env.QUEUE_DRIVER = originalQueueDriver;
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
});
