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

// Executable version of design D10's HTTP status-code audit table (row
// numbers below match that table). Every row hits the real buildApp via
// app.inject() — the point of the audit is proving what actually ships, not
// what the design intended to ship.
describe("HTTP status code audit (D10)", () => {
  it("row 1: GET /health -> 200", async () => {
    const app = await buildApp({ logger, ingestion: fakeIngestion(vi.fn()) });
    const response = await app.inject({ method: "GET", url: "/health" });
    expect(response.statusCode).toBe(200);
  });

  it("row 2: GET /webhook/whatsapp, matching hub.verify_token -> 200 with the challenge echoed back", async () => {
    const app = await buildApp({ logger, ingestion: fakeIngestion(vi.fn()) });
    const response = await app.inject({
      method: "GET",
      url: "/webhook/whatsapp",
      query: {
        "hub.mode": "subscribe",
        "hub.verify_token": config.metaWebhookVerifyToken,
        "hub.challenge": "audit-challenge",
      },
    });
    expect(response.statusCode).toBe(200);
    expect(response.body).toBe("audit-challenge");
  });

  it("row 3: GET /webhook/whatsapp, mismatched hub.verify_token -> 403", async () => {
    const app = await buildApp({ logger, ingestion: fakeIngestion(vi.fn()) });
    const response = await app.inject({
      method: "GET",
      url: "/webhook/whatsapp",
      query: { "hub.mode": "subscribe", "hub.verify_token": "wrong-token" },
    });
    expect(response.statusCode).toBe(403);
  });

  it("row 4: POST /webhook/whatsapp, missing signature -> 401, service never invoked", async () => {
    const ingest = vi.fn();
    const app = await buildApp({ logger, ingestion: fakeIngestion(ingest) });
    const response = await app.inject({
      method: "POST",
      url: "/webhook/whatsapp",
      headers: { "content-type": "application/json" },
      payload: JSON.stringify({ object: "whatsapp_business_account" }),
    });
    expect(response.statusCode).toBe(401);
    expect(ingest).not.toHaveBeenCalled();
  });

  it("row 5: POST /webhook/whatsapp, valid signature, save succeeds -> 200 (kept per explicit user decision — not 201/202)", async () => {
    const ingest = vi.fn().mockResolvedValue(undefined);
    const app = await buildApp({ logger, ingestion: fakeIngestion(ingest) });
    const rawBody = JSON.stringify({ object: "x" });
    const signature = sign(rawBody, config.metaAppSecret);

    const response = await app.inject({
      method: "POST",
      url: "/webhook/whatsapp",
      headers: { "content-type": "application/json", "x-hub-signature-256": signature },
      payload: rawBody,
    });

    expect(response.statusCode).toBe(200);
  });

  it("row 6: POST /webhook/whatsapp, DAO save fails -> 503 via the centralized error handler", async () => {
    const ingest = vi.fn().mockRejectedValue(new QueueUnavailableError("dao rejected"));
    const app = await buildApp({ logger, ingestion: fakeIngestion(ingest) });
    const rawBody = JSON.stringify({ object: "x" });
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

  it("row 7: POST /webhook/whatsapp, unparseable JSON body -> 400, not 500 (the fixed defect)", async () => {
    const app = await buildApp({ logger, ingestion: fakeIngestion(vi.fn()) });
    const response = await app.inject({
      method: "POST",
      url: "/webhook/whatsapp",
      headers: { "content-type": "application/json", "x-hub-signature-256": "sha256=irrelevant" },
      payload: "{not-json",
    });

    expect(response.statusCode).toBe(400);
    expect(response.json()).toEqual({ error: "malformed_payload", requestId: expect.any(String) });
  });

  it("row 8: POST /webhook/whatsapp, valid JSON of an unrecognized shape -> 200, never 400 for a well-formed but unexpected payload", async () => {
    const ingest = vi.fn().mockResolvedValue(undefined);
    const app = await buildApp({ logger, ingestion: fakeIngestion(ingest) });
    const rawBody = JSON.stringify({
      object: "whatsapp_business_account",
      entry: [{ changes: [{ field: "unknown_future_field" }] }],
    });
    const signature = sign(rawBody, config.metaAppSecret);

    const response = await app.inject({
      method: "POST",
      url: "/webhook/whatsapp",
      headers: { "content-type": "application/json", "x-hub-signature-256": signature },
      payload: rawBody,
    });

    expect(response.statusCode).toBe(200);
    expect(ingest).toHaveBeenCalledWith(JSON.parse(rawBody));
  });

  it("row 9: unknown route -> 404 (Fastify default, unchanged)", async () => {
    const app = await buildApp({ logger, ingestion: fakeIngestion(vi.fn()) });
    const response = await app.inject({ method: "GET", url: "/does-not-exist" });
    expect(response.statusCode).toBe(404);
  });

  it("row 10: any unclassified throw -> 500 with the generic body", async () => {
    const ingest = vi.fn().mockRejectedValue(new Error("unexpected bug"));
    const app = await buildApp({ logger, ingestion: fakeIngestion(ingest) });
    const rawBody = JSON.stringify({ object: "x" });
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
});
