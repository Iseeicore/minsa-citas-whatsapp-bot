import http from "node:http";
import type { AddressInfo } from "node:net";
import crypto from "node:crypto";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { handleVercelRequest, resetVercelHandlerCache } from "./vercel-handler.js";
import { config } from "./config.js";
import { logger } from "./logger.js";
import type { WebhookIngestionService } from "./services/webhook-ingestion.js";

function sign(rawBody: string, secret: string): string {
  return "sha256=" + crypto.createHmac("sha256", secret).update(rawBody).digest("hex");
}

function fakeIngestion(ingest: ReturnType<typeof vi.fn>): WebhookIngestionService {
  return { ingest };
}

async function listen(handler: http.RequestListener): Promise<{ server: http.Server; port: number }> {
  const server = http.createServer(handler);
  await new Promise<void>((resolve) => server.listen(0, resolve));
  return { server, port: (server.address() as AddressInfo).port };
}

// Proves the Vercel serverless adapter actually dispatches real HTTP traffic
// through Fastify's own router via server.emit("request", req, res) — a
// type-check alone cannot catch a wrong event name or a req/res shape
// mismatch, so this drives genuine sockets through a real http.Server.
describe("handleVercelRequest", () => {
  beforeEach(() => {
    resetVercelHandlerCache();
  });

  it("dispatches a real HTTP request through the underlying Fastify app", async () => {
    const deps = { logger, ingestion: fakeIngestion(vi.fn()) };
    const { server, port } = await listen((req, res) => {
      void handleVercelRequest(req, res, deps);
    });

    try {
      const response = await fetch(`http://127.0.0.1:${port}/health`);
      expect(response.status).toBe(200);
      expect(await response.json()).toEqual({ status: "ok" });
    } finally {
      server.close();
    }
  });

  it("reuses the cached Fastify app across requests instead of rebuilding it per call", async () => {
    const ingest = vi.fn().mockResolvedValue(undefined);
    const deps = { logger, ingestion: fakeIngestion(ingest) };
    // deps is only ever passed from this one closure — if the handler
    // rebuilt the app per request via buildDefaultDeps(), a second request
    // would silently run against a different, uncalled `ingest` mock.
    const { server, port } = await listen((req, res) => {
      void handleVercelRequest(req, res, deps);
    });

    try {
      const rawBody = JSON.stringify({ entry: [{ id: "1" }] });
      const headers = {
        "content-type": "application/json",
        "x-hub-signature-256": sign(rawBody, config.metaAppSecret),
      };

      await fetch(`http://127.0.0.1:${port}/webhook/whatsapp`, { method: "POST", headers, body: rawBody });
      await fetch(`http://127.0.0.1:${port}/webhook/whatsapp`, { method: "POST", headers, body: rawBody });

      expect(ingest).toHaveBeenCalledTimes(2);
    } finally {
      server.close();
    }
  });

  it("builds a fresh app after resetVercelHandlerCache() instead of reusing a stale one", async () => {
    const firstIngest = vi.fn().mockResolvedValue(undefined);
    const first = await listen((req, res) => {
      void handleVercelRequest(req, res, { logger, ingestion: fakeIngestion(firstIngest) });
    });
    const rawBody = JSON.stringify({ entry: [{ id: "1" }] });
    const headers = {
      "content-type": "application/json",
      "x-hub-signature-256": sign(rawBody, config.metaAppSecret),
    };
    await fetch(`http://127.0.0.1:${first.port}/webhook/whatsapp`, { method: "POST", headers, body: rawBody });
    first.server.close();

    resetVercelHandlerCache();

    const secondIngest = vi.fn().mockResolvedValue(undefined);
    const second = await listen((req, res) => {
      void handleVercelRequest(req, res, { logger, ingestion: fakeIngestion(secondIngest) });
    });
    try {
      await fetch(`http://127.0.0.1:${second.port}/webhook/whatsapp`, { method: "POST", headers, body: rawBody });
      expect(firstIngest).toHaveBeenCalledTimes(1);
      expect(secondIngest).toHaveBeenCalledTimes(1);
    } finally {
      second.server.close();
    }
  });
});
