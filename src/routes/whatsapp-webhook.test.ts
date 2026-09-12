import Fastify, { type FastifyInstance } from "fastify";
import crypto from "node:crypto";
import { describe, expect, it, vi } from "vitest";
import { config } from "../config.js";
import type { WebhookIngestionService } from "../services/webhook-ingestion.js";
import { createWhatsappWebhookRoutes, verifySignature } from "./whatsapp-webhook.js";

function sign(rawBody: string, secret: string): string {
  return "sha256=" + crypto.createHmac("sha256", secret).update(rawBody).digest("hex");
}

function fakeIngestion(ingest: ReturnType<typeof vi.fn>): WebhookIngestionService {
  return { ingest };
}

// Interim local harness (Phase 2 of hexagonal-architecture-refactor):
// createWhatsappWebhookRoutes now takes its ingestion dependency directly, so
// no module mocking is needed at all — a real behavioral improvement over
// Phase 1's transitional vi.doMock("../server.js") workaround. Phase 3
// replaces this local harness with the shared buildApp(deps) and asserts the
// 503 log via the collected pino stream instead of the ingest() call count.
async function buildTestApp(ingestion: WebhookIngestionService): Promise<FastifyInstance> {
  const app = Fastify();
  // Mirrors app.ts's raw-body content type parser — verifySignature and the
  // route handler both depend on request.rawBody being the exact bytes.
  app.addContentTypeParser("application/json", { parseAs: "buffer" }, (req, body, done) => {
    req.rawBody = body as Buffer;
    try {
      const text = (body as Buffer).toString("utf8");
      done(null, text.length ? JSON.parse(text) : {});
    } catch (err) {
      done(err as Error, undefined);
    }
  });
  await app.register(createWhatsappWebhookRoutes({ ingestion }));
  return app;
}

describe("whatsapp-webhook", () => {
  describe("verifySignature", () => {
    it("accepts a correctly computed HMAC signature", () => {
      const rawBody = Buffer.from(JSON.stringify({ hello: "world" }));
      const signature = sign(rawBody.toString("utf8"), config.metaAppSecret);

      expect(verifySignature(rawBody, signature)).toBe(true);
    });

    it("rejects a tampered signature of the same length", () => {
      const rawBody = Buffer.from(JSON.stringify({ hello: "world" }));
      const validSignature = sign(rawBody.toString("utf8"), config.metaAppSecret);
      const lastChar = validSignature.slice(-1);
      const tamperedSignature = validSignature.slice(0, -1) + (lastChar === "a" ? "b" : "a");

      expect(tamperedSignature).toHaveLength(validSignature.length);
      expect(verifySignature(rawBody, tamperedSignature)).toBe(false);
    });

    it("rejects a signature header of a different length without throwing (RangeError regression guard)", () => {
      const rawBody = Buffer.from(JSON.stringify({ hello: "world" }));

      expect(() => verifySignature(rawBody, "sha256=short")).not.toThrow();
      expect(verifySignature(rawBody, "sha256=short")).toBe(false);
    });
  });

  describe("POST /webhook/whatsapp guarded enqueue", () => {
    it("responds 503 when the ingestion service rejects", async () => {
      const ingest = vi.fn().mockRejectedValue(new Error("queue unreachable"));
      const app = await buildTestApp(fakeIngestion(ingest));

      const rawBody = JSON.stringify({ entry: [] });
      const signature = sign(rawBody, config.metaAppSecret);

      const response = await app.inject({
        method: "POST",
        url: "/webhook/whatsapp",
        headers: { "content-type": "application/json", "x-hub-signature-256": signature },
        payload: rawBody,
      });

      expect(response.statusCode).toBe(503);
      expect(ingest).toHaveBeenCalledTimes(1);
    });

    it("responds 200 with no body when the ingestion service resolves — unchanged behavior", async () => {
      const ingest = vi.fn().mockResolvedValue(undefined);
      const app = await buildTestApp(fakeIngestion(ingest));

      const rawBody = JSON.stringify({ entry: [] });
      const signature = sign(rawBody, config.metaAppSecret);

      const response = await app.inject({
        method: "POST",
        url: "/webhook/whatsapp",
        headers: { "content-type": "application/json", "x-hub-signature-256": signature },
        payload: rawBody,
      });

      expect(response.statusCode).toBe(200);
      expect(response.body).toBe("");
    });
  });
});
