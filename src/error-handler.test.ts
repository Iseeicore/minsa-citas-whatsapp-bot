import Fastify, { type FastifyBaseLogger } from "fastify";
import { describe, expect, it, vi } from "vitest";
import { errorHandler } from "./error-handler.js";
import { buildApp as buildRealApp } from "./app.js";
import { logger } from "./logger.js";
import type { WebhookIngestionService } from "./services/webhook-ingestion.js";

function fakeLogger(): FastifyBaseLogger {
  const logger: FastifyBaseLogger = {
    level: "info",
    fatal: vi.fn(),
    error: vi.fn(),
    warn: vi.fn(),
    info: vi.fn(),
    debug: vi.fn(),
    trace: vi.fn(),
    silent: vi.fn(),
    // Fastify creates a per-request child logger — returning the same
    // object keeps every call visible on the fakeLogger's own mock fns.
    child: vi.fn(() => logger),
  };
  return logger;
}

function buildApp(logger: FastifyBaseLogger) {
  const app = Fastify({ loggerInstance: logger });
  app.setErrorHandler(errorHandler);

  app.get("/boom", async () => {
    throw new Error("something exploded");
  });

  app.get("/boom-4xx", async () => {
    const err = Object.assign(new Error("bad request body"), { statusCode: 422 });
    throw err;
  });

  return app;
}

describe("errorHandler", () => {
  it("returns a generic 500 body and logs the error with err + reqId, no internals leaked", async () => {
    const logger = fakeLogger();
    const app = buildApp(logger);

    const response = await app.inject({ method: "GET", url: "/boom" });

    expect(response.statusCode).toBe(500);
    const body = response.json();
    expect(body).toEqual({ error: "internal_error", requestId: expect.any(String) });
    expect(JSON.stringify(body)).not.toContain("something exploded");

    expect(logger.error).toHaveBeenCalledTimes(1);
    const [context] = vi.mocked(logger.error).mock.calls[0] as [Record<string, unknown>];
    expect(context.err).toBeInstanceOf(Error);
    expect(context.reqId).toEqual(expect.any(String));
  });

  it("preserves a thrown error's own 4xx statusCode instead of forcing 500", async () => {
    const logger = fakeLogger();
    const app = buildApp(logger);

    const response = await app.inject({ method: "GET", url: "/boom-4xx" });

    expect(response.statusCode).toBe(422);
    const body = response.json();
    expect(body).toEqual({ error: "internal_error", requestId: expect.any(String) });
  });

  // Closes the "no real buildApp to import" gap (D1): the two tests above
  // exercise errorHandler in isolation and stay correct as-is; this proves
  // the handler is really wired into the shared composition root, not just
  // a hand-built mini app with the same setErrorHandler call.
  it("is really wired in buildApp: a malformed-JSON body reaches the shared error handler", async () => {
    const ingestion: WebhookIngestionService = { ingest: vi.fn() };
    const app = await buildRealApp({ logger, ingestion });

    const response = await app.inject({
      method: "POST",
      url: "/webhook/whatsapp",
      headers: { "content-type": "application/json", "x-hub-signature-256": "sha256=irrelevant" },
      payload: "{not-json",
    });

    const body = response.json();
    expect(body).toEqual({ error: "internal_error", requestId: expect.any(String) });
  });
});
