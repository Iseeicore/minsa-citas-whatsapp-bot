import crypto from "node:crypto";
import { describe, expect, it, vi } from "vitest";
import { buildApp } from "./app.js";
import { config } from "./config.js";
import { logger } from "./logger.js";
import { QueueUnavailableError } from "./domain/errors.js";
import type { WebhookIngestionService } from "./services/webhook-ingestion.js";

function sign(rawBody: string, secret: string): string {
  return "sha256=" + crypto.createHmac("sha256", secret).update(rawBody).digest("hex");
}

function fakeIngestion(ingest: ReturnType<typeof vi.fn>): WebhookIngestionService {
  return { ingest };
}

// No vi.doMock/vi.resetModules — buildApp is a plain function that accepts
// injected fakes directly (D1), unlike the old whatsappWebhookRoutes import
// that forced module mocking to swap out its dependencies.
describe("buildApp", () => {
  it("responds 401 without invoking the service when the signature is missing or invalid", async () => {
    const ingest = vi.fn();
    const app = await buildApp({ logger, ingestion: fakeIngestion(ingest) });

    const response = await app.inject({
      method: "POST",
      url: "/webhook/whatsapp",
      headers: { "content-type": "application/json" },
      payload: JSON.stringify({ entry: [] }),
    });

    expect(response.statusCode).toBe(401);
    expect(ingest).not.toHaveBeenCalled();
  });

  it("responds 503 via the centralized error handler when the ingestion service rejects (D9 — no route-level try/catch)", async () => {
    const ingest = vi.fn().mockRejectedValue(new QueueUnavailableError("dao rejected"));
    const app = await buildApp({ logger, ingestion: fakeIngestion(ingest) });

    const rawBody = JSON.stringify({ entry: [{ id: "1" }] });
    const signature = sign(rawBody, config.metaAppSecret);

    const response = await app.inject({
      method: "POST",
      url: "/webhook/whatsapp",
      headers: { "content-type": "application/json", "x-hub-signature-256": signature },
      payload: rawBody,
    });

    expect(response.statusCode).toBe(503);
    expect(response.json()).toEqual({ error: "service_unavailable", requestId: expect.any(String) });
  });

  it("responds 500 when the ingestion service rejects with an unclassified error — proves the route no longer forces 503 on any rejection", async () => {
    const ingest = vi.fn().mockRejectedValue(new Error("unexpected bug"));
    const app = await buildApp({ logger, ingestion: fakeIngestion(ingest) });

    const rawBody = JSON.stringify({ entry: [{ id: "1" }] });
    const signature = sign(rawBody, config.metaAppSecret);

    const response = await app.inject({
      method: "POST",
      url: "/webhook/whatsapp",
      headers: { "content-type": "application/json", "x-hub-signature-256": signature },
      payload: rawBody,
    });

    expect(response.statusCode).toBe(500);
    expect(response.json()).toEqual({ error: "internal_error", requestId: expect.any(String) });
  });

  it("responds 200 and passes the parsed body to ingest() when the signature is valid", async () => {
    const ingest = vi.fn().mockResolvedValue(undefined);
    const app = await buildApp({ logger, ingestion: fakeIngestion(ingest) });

    const payload = { entry: [{ id: "42" }] };
    const rawBody = JSON.stringify(payload);
    const signature = sign(rawBody, config.metaAppSecret);

    const response = await app.inject({
      method: "POST",
      url: "/webhook/whatsapp",
      headers: { "content-type": "application/json", "x-hub-signature-256": signature },
      payload: rawBody,
    });

    expect(response.statusCode).toBe(200);
    expect(ingest).toHaveBeenCalledWith(payload);
  });

  it("responds 400, not 500, when the JSON body is malformed (D10 row 7 fix)", async () => {
    const ingest = vi.fn();
    const app = await buildApp({ logger, ingestion: fakeIngestion(ingest) });

    const response = await app.inject({
      method: "POST",
      url: "/webhook/whatsapp",
      headers: { "content-type": "application/json", "x-hub-signature-256": "sha256=irrelevant" },
      payload: "{not-json",
    });

    expect(response.statusCode).toBe(400);
    expect(ingest).not.toHaveBeenCalled();
  });
});
