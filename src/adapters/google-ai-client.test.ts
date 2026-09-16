import { describe, expect, it, vi } from "vitest";
import type pino from "pino";
import { createGoogleAiClient } from "./google-ai-client.js";

const BASE_CONFIG = { googleClientApiKey: "test-key" };

function fakeLogger() {
  return { info: vi.fn(), warn: vi.fn(), error: vi.fn() } as unknown as pino.Logger;
}

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
}

describe("createGoogleAiClient", () => {
  describe("checkConnection", () => {
    it("GETs {models} with the key as a query param, no request body", async () => {
      const fetchImpl = vi.fn().mockResolvedValue(jsonResponse({ models: [{ name: "models/gemini-pro" }] }));
      const client = createGoogleAiClient({ config: BASE_CONFIG, logger: fakeLogger(), fetchImpl });

      await client.checkConnection();

      expect(fetchImpl).toHaveBeenCalledTimes(1);
      const [url, init] = fetchImpl.mock.calls[0] as [string, RequestInit];
      expect(url).toBe("https://generativelanguage.googleapis.com/v1beta/models?key=test-key");
      expect(init.method).toBe("GET");
    });

    it("returns ok:true with a model count on a 2xx response", async () => {
      const fetchImpl = vi
        .fn()
        .mockResolvedValue(jsonResponse({ models: [{ name: "models/gemini-pro" }, { name: "models/gemini-flash" }] }));
      const client = createGoogleAiClient({ config: BASE_CONFIG, logger: fakeLogger(), fetchImpl });

      const result = await client.checkConnection();

      expect(result).toEqual({ ok: true, detail: "Conexión establecida (2 modelo(s) disponible(s))." });
    });

    it.each([401, 403])("returns ok:false on a %i response (invalid/unauthorized key), never throws", async (status) => {
      const fetchImpl = vi.fn().mockResolvedValue(jsonResponse({}, status));
      const client = createGoogleAiClient({ config: BASE_CONFIG, logger: fakeLogger(), fetchImpl });

      const result = await client.checkConnection();

      expect(result.ok).toBe(false);
      expect(result.detail).toContain(String(status));
    });

    it("returns ok:false on a 500 response, never throws", async () => {
      const fetchImpl = vi.fn().mockResolvedValue(jsonResponse({}, 500));
      const client = createGoogleAiClient({ config: BASE_CONFIG, logger: fakeLogger(), fetchImpl });

      const result = await client.checkConnection();

      expect(result.ok).toBe(false);
    });

    it("returns ok:false when fetch itself rejects (network error / timeout), never throws", async () => {
      const fetchImpl = vi.fn().mockRejectedValue(new Error("network unreachable"));
      const client = createGoogleAiClient({ config: BASE_CONFIG, logger: fakeLogger(), fetchImpl });

      const result = await client.checkConnection();

      expect(result).toEqual({ ok: false, detail: "Fallo de red: network unreachable" });
    });

    it("never includes the API key in the returned detail", async () => {
      const fetchImpl = vi.fn().mockResolvedValue(jsonResponse({}, 401));
      const client = createGoogleAiClient({ config: BASE_CONFIG, logger: fakeLogger(), fetchImpl });

      const result = await client.checkConnection();

      expect(result.detail).not.toContain(BASE_CONFIG.googleClientApiKey);
    });
  });
});
