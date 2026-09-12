import crypto from "node:crypto";
import { afterAll, describe, expect, it } from "vitest";
import { buildApp } from "./app.js";
import { config } from "./config.js";
import { logger } from "./logger.js";
import { createRedisConversationEventDao } from "./adapters/redis-conversation-event-dao.js";
import { createWebhookIngestionService } from "./services/webhook-ingestion.js";

// Executable proof of D3: a Redis outage must not take the HTTP layer down.
// Builds the real app with an ingestion service backed by the real Redis
// adapter pointed at the dead port from vitest.setup.ts, using the real
// shared logger throughout — no fakes on the DAO or logging side, only the
// composition of already-proven pieces (Fastify requires a full logger
// interface — debug/fatal/trace/child — that a partial fake wouldn't satisfy).
function sign(rawBody: string, secret: string): string {
  return "sha256=" + crypto.createHmac("sha256", secret).update(rawBody).digest("hex");
}

describe("degraded queue — Redis outage does not take the HTTP layer down", () => {
  const dao = createRedisConversationEventDao({ config: { redisUrl: config.redisUrl }, logger });
  const ingestion = createWebhookIngestionService({ dao, logger, logHashSecret: config.logHashSecret });

  afterAll(async () => {
    await dao.close();
  });

  it("GET /health still returns 200", async () => {
    const app = await buildApp({ logger, ingestion });
    const response = await app.inject({ method: "GET", url: "/health" });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({ status: "ok" });
  });

  it("GET /webhook/whatsapp (Meta handshake) still returns 200 + challenge", async () => {
    const app = await buildApp({ logger, ingestion });
    const response = await app.inject({
      method: "GET",
      url: "/webhook/whatsapp",
      query: {
        "hub.mode": "subscribe",
        "hub.verify_token": config.metaWebhookVerifyToken,
        "hub.challenge": "challenge-accepted",
      },
    });

    expect(response.statusCode).toBe(200);
    expect(response.body).toBe("challenge-accepted");
  });

  it("POST /webhook/whatsapp with a valid signature returns 503 while Redis is down", async () => {
    const app = await buildApp({ logger, ingestion });
    const rawBody = JSON.stringify({ entry: [] });
    const signature = sign(rawBody, config.metaAppSecret);

    const response = await app.inject({
      method: "POST",
      url: "/webhook/whatsapp",
      headers: { "content-type": "application/json", "x-hub-signature-256": signature },
      payload: rawBody,
    });

    expect(response.statusCode).toBe(503);
  });
});
