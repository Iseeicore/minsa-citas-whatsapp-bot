import { describe, expect, it, vi } from "vitest";
import type pino from "pino";
import { createGoogleAiClient } from "./google-ai-client.js";

const BASE_CONFIG = { googleClientApiKey: "test-key", googleAiModel: "gemini-2.0-flash" };

function geminiResponse(parsed: unknown, status = 200) {
  return jsonResponse(
    { candidates: [{ content: { parts: [{ text: JSON.stringify(parsed) }] } }] },
    status
  );
}

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

  describe("validateUbigeo", () => {
    const INPUT = { departamento: "Lima", provincia: "Lima", distrito: "Lurigancho" };

    it("POSTs generateContent with the system_instruction, the ternary as the user turn, and a responseSchema — key in the URL, never the body", async () => {
      const fetchImpl = vi.fn().mockResolvedValue(geminiResponse({ estado: "valido", detalle: "ok" }));
      const client = createGoogleAiClient({ config: BASE_CONFIG, logger: fakeLogger(), fetchImpl });

      await client.validateUbigeo(INPUT);

      expect(fetchImpl).toHaveBeenCalledTimes(1);
      const [url, init] = fetchImpl.mock.calls[0] as [string, RequestInit];
      expect(url).toBe(
        "https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=test-key"
      );
      expect(init.method).toBe("POST");
      const body = JSON.parse(init.body as string) as Record<string, unknown>;
      expect(body.system_instruction).toBeDefined();
      expect(JSON.stringify(body)).toContain("Departamento: Lima");
      expect(JSON.stringify(body)).toContain("Distrito: Lurigancho");
      expect((body.generationConfig as Record<string, unknown>).responseMimeType).toBe("application/json");
    });

    it('returns ubigeo_ai_valid on estado:"valido"', async () => {
      const fetchImpl = vi.fn().mockResolvedValue(geminiResponse({ estado: "valido", detalle: "ok" }));
      const client = createGoogleAiClient({ config: BASE_CONFIG, logger: fakeLogger(), fetchImpl });

      const result = await client.validateUbigeo(INPUT);

      expect(result).toEqual({ status: "ubigeo_ai_valid" });
    });

    it.each(["invalido", "inconsistente"] as const)(
      'returns ubigeo_ai_flagged with estado/detalle/sugerencia on estado:"%s"',
      async (estado) => {
        const fetchImpl = vi.fn().mockResolvedValue(
          geminiResponse({ estado, detalle: "Trujillo no pertenece a Lima.", sugerencia: "¿La Libertad?" })
        );
        const client = createGoogleAiClient({ config: BASE_CONFIG, logger: fakeLogger(), fetchImpl });

        const result = await client.validateUbigeo(INPUT);

        expect(result).toEqual({
          status: "ubigeo_ai_flagged",
          estado,
          detalle: "Trujillo no pertenece a Lima.",
          sugerencia: "¿La Libertad?",
        });
      }
    );

    it("omits sugerencia from the result when the model omits it", async () => {
      const fetchImpl = vi.fn().mockResolvedValue(geminiResponse({ estado: "invalido", detalle: "No existe." }));
      const client = createGoogleAiClient({ config: BASE_CONFIG, logger: fakeLogger(), fetchImpl });

      const result = await client.validateUbigeo(INPUT);

      expect(result).toEqual({ status: "ubigeo_ai_flagged", estado: "invalido", detalle: "No existe." });
    });

    it("returns ubigeo_ai_unavailable on a non-2xx response, never throws", async () => {
      const fetchImpl = vi.fn().mockResolvedValue(jsonResponse({}, 500));
      const client = createGoogleAiClient({ config: BASE_CONFIG, logger: fakeLogger(), fetchImpl });

      const result = await client.validateUbigeo(INPUT);

      expect(result).toEqual({ status: "ubigeo_ai_unavailable" });
    });

    it("returns ubigeo_ai_unavailable when fetch itself rejects, never throws", async () => {
      const fetchImpl = vi.fn().mockRejectedValue(new Error("network unreachable"));
      const client = createGoogleAiClient({ config: BASE_CONFIG, logger: fakeLogger(), fetchImpl });

      const result = await client.validateUbigeo(INPUT);

      expect(result).toEqual({ status: "ubigeo_ai_unavailable" });
    });

    it("returns ubigeo_ai_unavailable when the inner text is not valid JSON, never throws", async () => {
      const fetchImpl = vi
        .fn()
        .mockResolvedValue(jsonResponse({ candidates: [{ content: { parts: [{ text: "not json" }] } }] }));
      const client = createGoogleAiClient({ config: BASE_CONFIG, logger: fakeLogger(), fetchImpl });

      const result = await client.validateUbigeo(INPUT);

      expect(result).toEqual({ status: "ubigeo_ai_unavailable" });
    });

    it("returns ubigeo_ai_unavailable when estado is outside the 3 known values, never throws", async () => {
      const fetchImpl = vi.fn().mockResolvedValue(geminiResponse({ estado: "quien-sabe", detalle: "?" }));
      const client = createGoogleAiClient({ config: BASE_CONFIG, logger: fakeLogger(), fetchImpl });

      const result = await client.validateUbigeo(INPUT);

      expect(result).toEqual({ status: "ubigeo_ai_unavailable" });
    });
  });
});
