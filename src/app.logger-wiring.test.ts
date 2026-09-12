import { describe, expect, it, vi } from "vitest";
import { buildApp, buildDefaultDeps } from "./app.js";
import { createLogger, logger as productionLogger } from "./logger.js";
import type { WebhookIngestionService } from "./services/webhook-ingestion.js";

// Closes change 1's open follow-up (obs #144/#145): proves bootstrap-time and
// request-scoped logs are written through the same pino stream. Reuses the
// { writable: true, write(msg) } collector pattern from logger.test.ts —
// `writable: true` is required or pino treats the object as options and
// silently falls back to stdout, which would make this test pass for the
// wrong reason.
describe("logger wiring", () => {
  it("bootstrap and request-scoped logs share one stream, with request logs carrying reqId", async () => {
    const lines: string[] = [];
    const collector = {
      writable: true,
      write(msg: string) {
        lines.push(msg);
      },
    };
    const logger = createLogger(collector);
    const ingestion: WebhookIngestionService = { ingest: vi.fn() };

    const app = await buildApp({ logger, ingestion });

    // Direct, non-request path — mirrors a bootstrap-time log call.
    logger.info("bootstrap-line");

    // Hits request.log.warn inside the route handler and returns 403.
    const response = await app.inject({
      method: "GET",
      url: "/webhook/whatsapp",
      query: { "hub.mode": "subscribe", "hub.verify_token": "wrong" },
    });
    expect(response.statusCode).toBe(403);

    const parsed = lines.map((line) => JSON.parse(line));
    const bootstrapIndex = parsed.findIndex((entry) => entry.msg === "bootstrap-line");
    const requestIndex = parsed.findIndex(
      (entry) => entry.msg === "Intento de verificación de webhook rechazado"
    );

    expect(bootstrapIndex).toBeGreaterThanOrEqual(0);
    expect(requestIndex).toBeGreaterThan(bootstrapIndex);
    expect(parsed[bootstrapIndex].reqId).toBeUndefined();
    expect(parsed[requestIndex].reqId).toEqual(expect.any(String));
  });

  it("buildDefaultDeps() wires production to the src/logger.ts singleton", () => {
    expect(buildDefaultDeps().logger).toBe(productionLogger);
  });
});
