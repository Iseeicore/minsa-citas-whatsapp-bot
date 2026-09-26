import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { resolveDistritoAi, resolveDistritoAiDetailed } from "@/lib/fsm/parsing/ai/distrito";
import { resolveFechaAi } from "@/lib/fsm/parsing/ai/fecha";
import { extractSelectionHints } from "@/lib/fsm/parsing/ai/selection-hints";
import { analyzeMainMenuIntent } from "@/lib/fsm/parsing/ai/main-menu-intent";
import type { LlmClient, LlmJsonOutcome, LlmJsonRequest } from "@/lib/fsm/parsing/ai/llm";

function modelSays(json: unknown): Response {
  return new Response(
    JSON.stringify({ candidates: [{ content: { parts: [{ text: JSON.stringify(json) }] } }] }),
    { status: 200 },
  );
}

const FAILURES: Array<[string, () => Promise<Response>]> = [
  ["a thrown request", () => Promise.reject(new Error("network down"))],
  ["a non-2xx answer", async () => new Response("busy", { status: 503 })],
  ["an answer without text", async () => new Response(JSON.stringify({ candidates: [] }), { status: 200 })],
  ["text that is not JSON", async () => new Response(JSON.stringify({ candidates: [{ content: { parts: [{ text: "hola" }] } }] }), { status: 200 })],
  ["a JSON null answer", async () => modelSays(null)],
];

describe("AI tasks in real-model mode", () => {
  let fetchSpy: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    vi.stubEnv("SANDBOX_USE_REAL_AI", "true");
    vi.stubEnv("GOOGLE_CLIENT_API", "test-key");
    fetchSpy = vi.fn();
    vi.stubGlobal("fetch", fetchSpy);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.unstubAllEnvs();
  });

  describe("resolveDistritoAi", () => {
    it("keeps only well-formed candidates", async () => {
      const good = { departamento: "Lima", provincia: "Lima", distrito: "Comas" };
      fetchSpy.mockResolvedValueOnce(modelSays({ candidates: [good, { distrito: "Incompleto" }] }));
      await expect(resolveDistritoAi("comas")).resolves.toEqual({ candidates: [good] });
    });

    it("sends the direct reply and the opening message in one user turn", async () => {
      fetchSpy.mockResolvedValueOnce(modelSays({ candidates: [] }));
      await resolveDistritoAi("comas", "quiero una cita");
      const body = JSON.parse(String((fetchSpy.mock.calls[0] as [string, RequestInit])[1].body));
      expect(body.contents[0].parts[0].text).toBe("Respuesta directa: comas\nMensaje inicial: quiero una cita");
    });

    it.each(FAILURES)("fails open to no candidates on %s", async (_label, respond) => {
      fetchSpy.mockImplementationOnce(respond);
      await expect(resolveDistritoAi("comas")).resolves.toEqual({ candidates: [] });
    });
  });

  describe("resolveFechaAi", () => {
    const options = [
      { id: "f1", label: "22/09/2026" },
      { id: "f2", label: "29/09/2026" },
    ];

    it("returns an offered id", async () => {
      fetchSpy.mockResolvedValueOnce(modelSays({ id: "f2", detalle: "x" }));
      await expect(resolveFechaAi("la próxima semana", "2026-09-20", options)).resolves.toEqual({ id: "f2" });
    });

    it("discards an id that was not offered", async () => {
      fetchSpy.mockResolvedValueOnce(modelSays({ id: "f9", detalle: "x" }));
      await expect(resolveFechaAi("la próxima semana", "2026-09-20", options)).resolves.toEqual({});
    });

    it("never calls the model without options", async () => {
      await expect(resolveFechaAi("mañana", "2026-09-20", [])).resolves.toEqual({});
      expect(fetchSpy).not.toHaveBeenCalled();
    });

    it.each(FAILURES)("fails open to no id on %s", async (_label, respond) => {
      fetchSpy.mockImplementationOnce(respond);
      await expect(resolveFechaAi("la próxima semana", "2026-09-20", options)).resolves.toEqual({});
    });
  });

  describe("extractSelectionHints", () => {
    it("returns the string hints and drops anything else", async () => {
      fetchSpy.mockResolvedValueOnce(modelSays({ especialidad: "Odontología", establecimiento: null, detalle: "x" }));
      await expect(extractSelectionHints("especialidad", "muelas")).resolves.toEqual({
        especialidad: "Odontología",
        establecimiento: undefined,
      });
    });

    it("never calls the model for blank text", async () => {
      await expect(extractSelectionHints("especialidad", "   ")).resolves.toEqual({});
      expect(fetchSpy).not.toHaveBeenCalled();
    });

    it.each(FAILURES)("fails open to no hints on %s", async (_label, respond) => {
      fetchSpy.mockImplementationOnce(respond);
      await expect(extractSelectionHints("especialidad", "muelas")).resolves.toEqual({});
    });
  });
});

describe("AI tasks with an injected LlmClient (no provider, no fetch)", () => {
  function clientAnswering(outcome: LlmJsonOutcome) {
    const requests: LlmJsonRequest[] = [];
    const client: LlmClient = {
      provider: "gemini",
      generateJson: async (request) => {
        requests.push(request);
        return outcome;
      },
    };
    return { client, requests };
  }

  beforeEach(() => {
    vi.stubEnv("SANDBOX_USE_REAL_AI", "false");
    vi.stubGlobal("fetch", vi.fn(() => { throw new Error("no HTTP call is expected"); }));
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.unstubAllEnvs();
  });

  const OPTIONS = [
    { id: "1", label: "22/09/2026" },
    { id: "2", label: "23/09/2026" },
  ];

  it("resolveFechaAi uses the injected client and only accepts an id that was offered", async () => {
    const offered = clientAnswering({ ok: true, json: { id: "2" } });
    await expect(resolveFechaAi("el martes", "2026-09-21", OPTIONS, offered.client)).resolves.toEqual({ id: "2" });
    expect(offered.requests[0]).toMatchObject({ operation: "resolve_fecha_ai" });

    const invented = clientAnswering({ ok: true, json: { id: "99" } });
    await expect(resolveFechaAi("el martes", "2026-09-21", OPTIONS, invented.client)).resolves.toEqual({});
  });

  it("resolveFechaAi falls back when the client reports a failure", async () => {
    const failing = clientAnswering({ ok: false, failure: "no_text" });
    await expect(resolveFechaAi("el martes", "2026-09-21", OPTIONS, failing.client)).resolves.toEqual({});
  });

  it("resolveDistritoAi keeps only well-formed candidates from the injected client", async () => {
    const good = { departamento: "Lima", provincia: "Lima", distrito: "Comas" };
    const { client } = clientAnswering({ ok: true, json: { candidates: [good, { distrito: "Incompleto" }] } });
    await expect(resolveDistritoAi("comas", undefined, client)).resolves.toEqual({ candidates: [good] });
  });

  it("resolveDistritoAi with no client uses the fixed fallback", async () => {
    const result = await resolveDistritoAi("miraflores", undefined, null);
    expect(result.candidates).toHaveLength(2);
  });

  it("analyzeMainMenuIntent maps an injected client failure to unclear", async () => {
    const { client } = clientAnswering({ ok: false, failure: "http_error", status: 503, model: "any" });
    await expect(analyzeMainMenuIntent("quiero una cita", client)).resolves.toEqual({ intent: "unclear" });
  });

  it("extractSelectionHints reads both hints from the injected client", async () => {
    const { client } = clientAnswering({ ok: true, json: { especialidad: "Pediatría", establecimiento: null } });
    await expect(extractSelectionHints("especialidad", "pediatria", client)).resolves.toEqual({
      especialidad: "Pediatría",
      establecimiento: undefined,
    });
  });
});

describe("resolveDistritoAiDetailed: tells a failure apart from 'no district found'", () => {
  function clientAnswering(outcome: LlmJsonOutcome): LlmClient {
    return { provider: "gemini", generateJson: async () => outcome };
  }

  const good = { departamento: "Lima", provincia: "Lima", distrito: "Comas" };

  it("reports found with the well-formed candidates", async () => {
    const client = clientAnswering({ ok: true, json: { candidates: [good] } });
    await expect(resolveDistritoAiDetailed("comas", undefined, client)).resolves.toEqual({
      outcome: "found",
      candidates: [good],
    });
  });

  it("reports not_found when the model answers with no valid candidate", async () => {
    const client = clientAnswering({ ok: true, json: { candidates: [{ distrito: "Incompleto" }] } });
    await expect(resolveDistritoAiDetailed("xyz", undefined, client)).resolves.toEqual({
      outcome: "not_found",
      candidates: [],
    });
  });

  it.each<[string, LlmJsonOutcome]>([
    ["a request failure", { ok: false, failure: "request_failed", errorName: "TimeoutError" }],
    ["an HTTP error", { ok: false, failure: "http_error", status: 500, model: "m" }],
    ["no text", { ok: false, failure: "no_text" }],
    ["invalid JSON", { ok: false, failure: "invalid_json" }],
    ["a JSON null answer", { ok: true, json: null }],
    ["candidates that are not a list", { ok: true, json: { candidates: "Comas" } }],
  ])("reports failed on %s", async (_label, outcome) => {
    await expect(resolveDistritoAiDetailed("comas", undefined, clientAnswering(outcome))).resolves.toEqual({
      outcome: "failed",
      candidates: [],
    });
  });

  it("with no client reports found or not_found from the fixed fallback", async () => {
    await expect(resolveDistritoAiDetailed("lurigancho", undefined, null)).resolves.toMatchObject({ outcome: "found" });
    await expect(resolveDistritoAiDetailed("nada", undefined, null)).resolves.toEqual({
      outcome: "not_found",
      candidates: [],
    });
  });
});
