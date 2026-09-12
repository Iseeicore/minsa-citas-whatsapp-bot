import crypto from "node:crypto";
import { describe, expect, it, vi } from "vitest";
import { buildApp } from "../app.js";
import { config } from "../config.js";
import { createLogger } from "../logger.js";
import type { WebhookIngestionService } from "../services/webhook-ingestion.js";
import { verifySignature } from "./whatsapp-webhook.js";

function sign(rawBody: string, secret: string): string {
  return "sha256=" + crypto.createHmac("sha256", secret).update(rawBody).digest("hex");
}

function fakeIngestion(ingest: ReturnType<typeof vi.fn>): WebhookIngestionService {
  return { ingest };
}

// Reuses the { writable: true, write(msg) } collector pattern from
// logger.test.ts / app.logger-wiring.test.ts — `writable: true` is required
// or pino silently falls back to stdout, which would make log assertions
// pass for the wrong reason.
function collectingLogger() {
  const lines: string[] = [];
  const logger = createLogger({
    writable: true,
    write(msg: string) {
      lines.push(msg);
    },
  });
  return { logger, lines: () => lines.map((line) => JSON.parse(line)) };
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
    it("responds 503 and logs with event context (via the shared pino stream) when ingestion rejects", async () => {
      const { logger, lines } = collectingLogger();
      const ingest = vi.fn().mockRejectedValue(new Error("queue unreachable"));
      const app = await buildApp({ logger, ingestion: fakeIngestion(ingest) });

      const rawBody = JSON.stringify({ entry: [] });
      const signature = sign(rawBody, config.metaAppSecret);

      const response = await app.inject({
        method: "POST",
        url: "/webhook/whatsapp",
        headers: { "content-type": "application/json", "x-hub-signature-256": signature },
        payload: rawBody,
      });

      expect(response.statusCode).toBe(503);

      const errorLine = lines().find((entry) => entry.event === "inbound-event");
      expect(errorLine).toBeDefined();
      expect(errorLine.level).toBe(50); // pino "error"
      expect(errorLine.err.message).toBe("queue unreachable");
      expect(errorLine.reqId).toEqual(expect.any(String));
    });

    it("responds 200 with no body when ingestion resolves — unchanged behavior", async () => {
      const { logger } = collectingLogger();
      const ingest = vi.fn().mockResolvedValue(undefined);
      const app = await buildApp({ logger, ingestion: fakeIngestion(ingest) });

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
      expect(ingest).toHaveBeenCalledWith({ entry: [] });
    });
  });
});
