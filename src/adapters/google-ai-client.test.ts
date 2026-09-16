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

    const ALL_VALID_CAMPOS = {
      departamento: { valido: true },
      provincia: { valido: true },
      distrito: { valido: true },
    };

    it("returns ubigeo_ai_valid when all 3 campos are valido:true", async () => {
      const fetchImpl = vi.fn().mockResolvedValue(geminiResponse({ campos: ALL_VALID_CAMPOS, detalle: "ok" }));
      const client = createGoogleAiClient({ config: BASE_CONFIG, logger: fakeLogger(), fetchImpl });

      const result = await client.validateUbigeo(INPUT);

      expect(result).toEqual({ status: "ubigeo_ai_valid" });
    });

    it("returns ubigeo_ai_field_issues with one issue when only distrito is valido:false", async () => {
      const fetchImpl = vi.fn().mockResolvedValue(
        geminiResponse({
          campos: {
            departamento: { valido: true },
            provincia: { valido: true },
            distrito: { valido: false, sugerencia: "Santiago de Surco" },
          },
          detalle: "El distrito no coincide con ninguno oficial de esa provincia.",
        })
      );
      const client = createGoogleAiClient({ config: BASE_CONFIG, logger: fakeLogger(), fetchImpl });

      const result = await client.validateUbigeo(INPUT);

      expect(result).toEqual({
        status: "ubigeo_ai_field_issues",
        issues: [{ field: "distrito", valorIngresado: INPUT.distrito, sugerencia: "Santiago de Surco" }],
        detalle: "El distrito no coincide con ninguno oficial de esa provincia.",
      });
    });

    it("returns ubigeo_ai_field_issues with two issues (provincia + distrito) in field order, departamento omitted", async () => {
      const fetchImpl = vi.fn().mockResolvedValue(
        geminiResponse({
          campos: {
            departamento: { valido: true },
            provincia: { valido: false, sugerencia: "La Libertad" },
            distrito: { valido: false, sugerencia: "Trujillo" },
          },
          detalle: "Provincia y distrito no coinciden con el departamento.",
        })
      );
      const client = createGoogleAiClient({ config: BASE_CONFIG, logger: fakeLogger(), fetchImpl });

      const result = await client.validateUbigeo(INPUT);

      expect(result).toEqual({
        status: "ubigeo_ai_field_issues",
        issues: [
          { field: "provincia", valorIngresado: INPUT.provincia, sugerencia: "La Libertad" },
          { field: "distrito", valorIngresado: INPUT.distrito, sugerencia: "Trujillo" },
        ],
        detalle: "Provincia y distrito no coinciden con el departamento.",
      });
    });

    it("valorIngresado always comes from the original input, never from the AI's own echo", async () => {
      const fetchImpl = vi.fn().mockResolvedValue(
        geminiResponse({
          campos: {
            departamento: { valido: true },
            provincia: { valido: true },
            distrito: { valido: false, sugerencia: "Miraflores" },
          },
          detalle: "No existe.",
        })
      );
      const client = createGoogleAiClient({ config: BASE_CONFIG, logger: fakeLogger(), fetchImpl });

      const result = await client.validateUbigeo(INPUT);

      expect(result.status).toBe("ubigeo_ai_field_issues");
      if (result.status === "ubigeo_ai_field_issues") {
        expect(result.issues[0].valorIngresado).toBe(INPUT.distrito);
      }
    });

    it("omits sugerencia from an issue when the model omits it", async () => {
      const fetchImpl = vi.fn().mockResolvedValue(
        geminiResponse({
          campos: { departamento: { valido: true }, provincia: { valido: true }, distrito: { valido: false } },
          detalle: "No existe.",
        })
      );
      const client = createGoogleAiClient({ config: BASE_CONFIG, logger: fakeLogger(), fetchImpl });

      const result = await client.validateUbigeo(INPUT);

      expect(result).toEqual({
        status: "ubigeo_ai_field_issues",
        issues: [{ field: "distrito", valorIngresado: INPUT.distrito }],
        detalle: "No existe.",
      });
    });

    it("treats the literal string \"null\" from the model as no suggestion, never surfaced to the citizen", async () => {
      const fetchImpl = vi.fn().mockResolvedValue(
        geminiResponse({
          campos: {
            departamento: { valido: true },
            provincia: { valido: false, sugerencia: "null" },
            distrito: { valido: true },
          },
          detalle: "No existe.",
        })
      );
      const client = createGoogleAiClient({ config: BASE_CONFIG, logger: fakeLogger(), fetchImpl });

      const result = await client.validateUbigeo(INPUT);

      expect(result).toEqual({
        status: "ubigeo_ai_field_issues",
        issues: [{ field: "provincia", valorIngresado: INPUT.provincia }],
        detalle: "No existe.",
      });
    });

    it("returns ubigeo_ai_unavailable when a campo is missing from the response", async () => {
      const fetchImpl = vi.fn().mockResolvedValue(
        geminiResponse({ campos: { departamento: { valido: true }, provincia: { valido: true } }, detalle: "ok" })
      );
      const client = createGoogleAiClient({ config: BASE_CONFIG, logger: fakeLogger(), fetchImpl });

      const result = await client.validateUbigeo(INPUT);

      expect(result).toEqual({ status: "ubigeo_ai_unavailable" });
    });

    it("returns ubigeo_ai_unavailable when campos is missing entirely", async () => {
      const fetchImpl = vi.fn().mockResolvedValue(geminiResponse({ detalle: "ok" }));
      const client = createGoogleAiClient({ config: BASE_CONFIG, logger: fakeLogger(), fetchImpl });

      const result = await client.validateUbigeo(INPUT);

      expect(result).toEqual({ status: "ubigeo_ai_unavailable" });
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

    it("returns ubigeo_ai_unavailable when a campo's valido is not a boolean, never throws", async () => {
      const fetchImpl = vi.fn().mockResolvedValue(
        geminiResponse({
          campos: { departamento: { valido: "si" }, provincia: { valido: true }, distrito: { valido: true } },
          detalle: "?",
        })
      );
      const client = createGoogleAiClient({ config: BASE_CONFIG, logger: fakeLogger(), fetchImpl });

      const result = await client.validateUbigeo(INPUT);

      expect(result).toEqual({ status: "ubigeo_ai_unavailable" });
    });
  });
});
