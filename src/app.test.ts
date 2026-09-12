import crypto from "node:crypto";
import { describe, expect, it, vi } from "vitest";
import { buildApp } from "./app.js";
import { config } from "./config.js";
import { logger } from "./logger.js";
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

  it("responds 503 when the ingestion service rejects", async () => {
    const ingest = vi.fn().mockRejectedValue(new Error("queue unreachable"));
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
});
