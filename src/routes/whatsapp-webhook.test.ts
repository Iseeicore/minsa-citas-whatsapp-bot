import Fastify, { type FastifyInstance } from "fastify";
import crypto from "node:crypto";
import { afterEach, describe, expect, it, vi } from "vitest";
import { config } from "../config.js";

function sign(rawBody: string, secret: string): string {
  return "sha256=" + crypto.createHmac("sha256", secret).update(rawBody).digest("hex");
}

async function buildTestApp(
  routes: (typeof import("./whatsapp-webhook.js"))["whatsappWebhookRoutes"]
): Promise<FastifyInstance> {
  const app = Fastify();
  // Mirrors server.ts's raw-body content type parser — verifySignature and
  // the route handler both depend on request.rawBody being the exact bytes.
  app.addContentTypeParser("application/json", { parseAs: "buffer" }, (req, body, done) => {
    req.rawBody = body as Buffer;
    try {
      const text = (body as Buffer).toString("utf8");
      done(null, text.length ? JSON.parse(text) : {});
    } catch (err) {
      done(err as Error, undefined);
    }
  });
  await app.register(routes);
  return app;
}

// Transitional (Phase 1 of hexagonal-architecture-refactor): whatsapp-webhook.ts
// now imports its mutable `conversationQueue` binding from server.ts (see
// server.ts's module-scope comment). server.ts self-invokes main() — including
// a real app.listen() — as an unguarded side effect of module load, so every
// test that imports whatsapp-webhook.ts must mock "../server.js" to avoid
// starting a live server. This whole workaround is replaced in Phase 2/3 when
// the route becomes createWhatsappWebhookRoutes({ ingestion }) and this file
// migrates to the shared buildApp(deps) with injected fakes.
function mockServerQueue(add: ReturnType<typeof vi.fn>) {
  vi.doMock("../server.js", () => ({
    conversationQueue: { mode: "redis", add, close: vi.fn().mockResolvedValue(undefined) },
  }));
}

describe("whatsapp-webhook", () => {
  afterEach(() => {
    vi.doUnmock("../server.js");
    vi.doUnmock("../logger.js");
    vi.resetModules();
  });

  describe("verifySignature", () => {
    it("accepts a correctly computed HMAC signature", async () => {
      mockServerQueue(vi.fn().mockResolvedValue(undefined));
      vi.resetModules();
      const { verifySignature } = await import("./whatsapp-webhook.js");
      const rawBody = Buffer.from(JSON.stringify({ hello: "world" }));
      const signature = sign(rawBody.toString("utf8"), config.metaAppSecret);

      expect(verifySignature(rawBody, signature)).toBe(true);
    });

    it("rejects a tampered signature of the same length", async () => {
      mockServerQueue(vi.fn().mockResolvedValue(undefined));
      vi.resetModules();
      const { verifySignature } = await import("./whatsapp-webhook.js");
      const rawBody = Buffer.from(JSON.stringify({ hello: "world" }));
      const validSignature = sign(rawBody.toString("utf8"), config.metaAppSecret);
      const lastChar = validSignature.slice(-1);
      const tamperedSignature = validSignature.slice(0, -1) + (lastChar === "a" ? "b" : "a");

      expect(tamperedSignature).toHaveLength(validSignature.length);
      expect(verifySignature(rawBody, tamperedSignature)).toBe(false);
    });

    it("rejects a signature header of a different length without throwing (RangeError regression guard)", async () => {
      mockServerQueue(vi.fn().mockResolvedValue(undefined));
      vi.resetModules();
      const { verifySignature } = await import("./whatsapp-webhook.js");
      const rawBody = Buffer.from(JSON.stringify({ hello: "world" }));

      expect(() => verifySignature(rawBody, "sha256=short")).not.toThrow();
      expect(verifySignature(rawBody, "sha256=short")).toBe(false);
    });
  });

  describe("POST /webhook/whatsapp guarded enqueue", () => {
    it("responds 503 and logs with event context when conversationQueue.add rejects", async () => {
      const error = vi.fn();
      vi.doMock("../logger.js", () => ({
        logger: { error, warn: vi.fn(), info: vi.fn() },
      }));
      mockServerQueue(vi.fn().mockRejectedValue(new Error("queue unreachable")));

      vi.resetModules();
      const { whatsappWebhookRoutes } = await import("./whatsapp-webhook.js");
      const app = await buildTestApp(whatsappWebhookRoutes);

      const rawBody = JSON.stringify({ entry: [] });
      const signature = sign(rawBody, config.metaAppSecret);

      const response = await app.inject({
        method: "POST",
        url: "/webhook/whatsapp",
        headers: {
          "content-type": "application/json",
          "x-hub-signature-256": signature,
        },
        payload: rawBody,
      });

      expect(response.statusCode).toBe(503);
      expect(error).toHaveBeenCalledTimes(1);
      const [context] = vi.mocked(error).mock.calls[0] as [Record<string, unknown>];
      expect(context).toMatchObject({ event: "inbound-event" });
      expect(context.err).toBeInstanceOf(Error);
    });

    it("responds 200 with no body when conversationQueue.add resolves — unchanged behavior", async () => {
      mockServerQueue(vi.fn().mockResolvedValue(undefined));

      vi.resetModules();
      const { whatsappWebhookRoutes } = await import("./whatsapp-webhook.js");
      const app = await buildTestApp(whatsappWebhookRoutes);

      const rawBody = JSON.stringify({ entry: [] });
      const signature = sign(rawBody, config.metaAppSecret);

      const response = await app.inject({
        method: "POST",
        url: "/webhook/whatsapp",
        headers: {
          "content-type": "application/json",
          "x-hub-signature-256": signature,
        },
        payload: rawBody,
      });

      expect(response.statusCode).toBe(200);
      expect(response.body).toBe("");
    });
  });
});
