import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { resolveDistritoAi, resolveDistritoAiDetailed } from "@/lib/fsm/parsing/ai/distrito";
import { resolveFechaAi } from "@/lib/fsm/parsing/ai/fecha";
import { extractSelectionHints } from "@/lib/fsm/parsing/ai/selection-hints";
import { analyzeMainMenuIntent } from "@/lib/fsm/parsing/ai/main-menu-intent";
import { analyzeFotoIntent } from "@/lib/fsm/parsing/ai/incidencia-foto-intent";
import type { LlmClient, LlmJsonOutcome, LlmJsonRequest } from "@/lib/fsm/parsing/ai/llm";
import { LlmFailure } from "@/lib/enums/llm-failure";
import { AiTaskStatus } from "@/lib/enums/ai-task-status";
import { logger } from "@/lib/observability/logger";
import { LLM_DISABLED, LLM_MISCONFIGURED, llmAvailable } from "@/tests/support/llm-lookup";

function modelSays(json: unknown): Response {
  return new Response(JSON.stringify({ candidates: [{ content: { parts: [{ text: JSON.stringify(json) }] } }] }), { status: 200 });
}

const FAILURES: Array<[string, () => Promise<Response>]> = [
  ["a thrown request", () => Promise.reject(new Error("network down"))],
  ["a non-2xx answer", async () => new Response("busy", { status: 503 })],
  ["an answer without text", async () => new Response(JSON.stringify({ candidates: [] }), { status: 200 })],
  [
    "text that is not JSON",
    async () => new Response(JSON.stringify({ candidates: [{ content: { parts: [{ text: "hola" }] } }] }), { status: 200 }),
  ],
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
      await expect(resolveFechaAi("la próxima semana", "2026-09-20", options)).resolves.toEqual({
        status: AiTaskStatus.ANSWERED,
        id: "f2",
      });
    });

    it("discards an id that was not offered", async () => {
      fetchSpy.mockResolvedValueOnce(modelSays({ id: "f9", detalle: "x" }));
      await expect(resolveFechaAi("la próxima semana", "2026-09-20", options)).resolves.toEqual({ status: AiTaskStatus.ANSWERED });
    });

    it("never calls the model without options", async () => {
      await expect(resolveFechaAi("mañana", "2026-09-20", [])).resolves.toEqual({ status: AiTaskStatus.ANSWERED });
      expect(fetchSpy).not.toHaveBeenCalled();
    });

    it.each(FAILURES)("reports the model as unavailable, not as no id, on %s", async (_label, respond) => {
      fetchSpy.mockImplementationOnce(respond);
      await expect(resolveFechaAi("la próxima semana", "2026-09-20", options)).resolves.toEqual({ status: AiTaskStatus.UNAVAILABLE });
    });
  });

  describe("extractSelectionHints", () => {
    it("returns the string hints and drops anything else", async () => {
      fetchSpy.mockResolvedValueOnce(modelSays({ especialidad: "Odontología", establecimiento: null, detalle: "x" }));
      await expect(extractSelectionHints("especialidad", "muelas")).resolves.toEqual({
        status: AiTaskStatus.ANSWERED,
        especialidad: "Odontología",
        establecimiento: undefined,
      });
    });

    it("never calls the model for blank text", async () => {
      await expect(extractSelectionHints("especialidad", "   ")).resolves.toEqual({ status: AiTaskStatus.ANSWERED });
      expect(fetchSpy).not.toHaveBeenCalled();
    });

    it.each(FAILURES)("reports the model as unavailable, not as no hints, on %s", async (_label, respond) => {
      fetchSpy.mockImplementationOnce(respond);
      await expect(extractSelectionHints("especialidad", "muelas")).resolves.toEqual({ status: AiTaskStatus.UNAVAILABLE });
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
    vi.stubGlobal(
      "fetch",
      vi.fn(() => {
        throw new Error("no HTTP call is expected");
      }),
    );
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.unstubAllEnvs();
    vi.restoreAllMocks();
  });

  const OPTIONS = [
    { id: "1", label: "22/09/2026" },
    { id: "2", label: "23/09/2026" },
  ];

  it("resolveFechaAi uses the injected client and only accepts an id that was offered", async () => {
    const offered = clientAnswering({ ok: true, json: { id: "2" } });
    await expect(resolveFechaAi("el martes", "2026-09-21", OPTIONS, llmAvailable(offered.client))).resolves.toEqual({
      status: AiTaskStatus.ANSWERED,
      id: "2",
    });
    expect(offered.requests[0]).toMatchObject({ operation: "resolve_fecha_ai" });

    const invented = clientAnswering({ ok: true, json: { id: "99" } });
    await expect(resolveFechaAi("el martes", "2026-09-21", OPTIONS, llmAvailable(invented.client))).resolves.toEqual({
      status: AiTaskStatus.ANSWERED,
    });
  });

  it("resolveFechaAi reports unavailable and logs the reason when the client reports a failure", async () => {
    const warn = vi.spyOn(logger, "warn");
    const failing = clientAnswering({ ok: false, failure: LlmFailure.NO_TEXT });
    await expect(resolveFechaAi("el martes", "2026-09-21", OPTIONS, llmAvailable(failing.client))).resolves.toEqual({
      status: AiTaskStatus.UNAVAILABLE,
    });
    expect(warn).toHaveBeenCalledWith("ai.fallback", {
      operation: "resolve_fecha_ai",
      fellBackTo: "reprompt",
      reason: "no text in the response",
    });
  });

  it("resolveFechaAi reports unavailable when the answer is not an object", async () => {
    const nullAnswer = clientAnswering({ ok: true, json: null });
    await expect(resolveFechaAi("el martes", "2026-09-21", OPTIONS, llmAvailable(nullAnswer.client))).resolves.toEqual({
      status: AiTaskStatus.UNAVAILABLE,
    });
  });

  it("extractSelectionHints and analyzeFotoIntent log the reason when the client fails", async () => {
    const warn = vi.spyOn(logger, "warn");
    const failing = clientAnswering({ ok: false, failure: LlmFailure.HTTP_ERROR, status: 503, model: "m" });

    await extractSelectionHints("especialidad", "pediatria", llmAvailable(failing.client));
    await analyzeFotoIntent("no deseo", llmAvailable(failing.client));

    expect(warn).toHaveBeenCalledWith("ai.fallback", {
      operation: "extract_selection_hints",
      fellBackTo: "reprompt",
      reason: "HTTP 503 from model m",
    });
    expect(warn).toHaveBeenCalledWith("ai.fallback", {
      operation: "analyze_incidencia_foto_intent",
      fellBackTo: "await_foto",
      reason: "HTTP 503 from model m",
    });
  });

  it.each([
    ["resolveFechaAi", () => resolveFechaAi("el martes", "2026-09-21", OPTIONS, LLM_MISCONFIGURED)],
    ["extractSelectionHints", () => extractSelectionHints("especialidad", "pediatria", LLM_MISCONFIGURED)],
    ["analyzeFotoIntent", () => analyzeFotoIntent("no deseo", LLM_MISCONFIGURED)],
  ])("%s reports unavailable when the provider is misconfigured, never the fixed fallback", async (_label, run) => {
    await expect(run()).resolves.toEqual({ status: AiTaskStatus.UNAVAILABLE });
  });

  it("resolveDistritoAiDetailed reports failed when the provider is misconfigured, never the demo candidates", async () => {
    await expect(resolveDistritoAiDetailed("miraflores", undefined, LLM_MISCONFIGURED)).resolves.toEqual({
      outcome: "failed",
      candidates: [],
    });
  });

  it("analyzeMainMenuIntent answers unclear when the provider is misconfigured, never the keyword fallback", async () => {
    await expect(analyzeMainMenuIntent("quiero una cita", LLM_MISCONFIGURED)).resolves.toEqual({ intent: "unclear" });
  });

  it("resolveDistritoAi keeps only well-formed candidates from the injected client", async () => {
    const good = { departamento: "Lima", provincia: "Lima", distrito: "Comas" };
    const { client } = clientAnswering({ ok: true, json: { candidates: [good, { distrito: "Incompleto" }] } });
    await expect(resolveDistritoAi("comas", undefined, llmAvailable(client))).resolves.toEqual({ candidates: [good] });
  });

  it("resolveDistritoAi with the AI disabled uses the fixed fallback", async () => {
    const result = await resolveDistritoAi("miraflores", undefined, LLM_DISABLED);
    expect(result.candidates).toHaveLength(2);
  });

  it("analyzeMainMenuIntent maps an injected client failure to unclear", async () => {
    const { client } = clientAnswering({ ok: false, failure: LlmFailure.HTTP_ERROR, status: 503, model: "any" });
    await expect(analyzeMainMenuIntent("quiero una cita", llmAvailable(client))).resolves.toEqual({ intent: "unclear" });
  });

  it("extractSelectionHints reads both hints from the injected client", async () => {
    const { client } = clientAnswering({ ok: true, json: { especialidad: "Pediatría", establecimiento: null } });
    await expect(extractSelectionHints("especialidad", "pediatria", llmAvailable(client))).resolves.toEqual({
      status: AiTaskStatus.ANSWERED,
      especialidad: "Pediatría",
      establecimiento: undefined,
    });
  });

  it("analyzeFotoIntent reads quiere_omitir from the injected client", async () => {
    const { client } = clientAnswering({ ok: true, json: { quiere_omitir: true, detalle: "dijo que no" } });
    await expect(analyzeFotoIntent("no deseo", llmAvailable(client))).resolves.toEqual({
      status: AiTaskStatus.ANSWERED,
      quiereOmitir: true,
    });
  });

  it("analyzeFotoIntent reports unavailable, not 'no quiere omitir', cuando el cliente falla", async () => {
    const { client } = clientAnswering({ ok: false, failure: LlmFailure.NO_TEXT });
    await expect(analyzeFotoIntent("no deseo", llmAvailable(client))).resolves.toEqual({ status: AiTaskStatus.UNAVAILABLE });
  });

  it("analyzeFotoIntent con la IA apagada (modo fake): reconoce frases de rechazo fijas", async () => {
    await expect(analyzeFotoIntent("no deseo", LLM_DISABLED)).resolves.toEqual({ status: AiTaskStatus.ANSWERED, quiereOmitir: true });
    await expect(analyzeFotoIntent("prefiero no", LLM_DISABLED)).resolves.toEqual({ status: AiTaskStatus.ANSWERED, quiereOmitir: true });
    await expect(analyzeFotoIntent("hola, buen día", LLM_DISABLED)).resolves.toEqual({
      status: AiTaskStatus.ANSWERED,
      quiereOmitir: false,
    });
  });
});

describe("resolveDistritoAiDetailed: tells a failure apart from 'no district found'", () => {
  function clientAnswering(outcome: LlmJsonOutcome) {
    return llmAvailable({ provider: "gemini", generateJson: async () => outcome });
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
    ["a request failure", { ok: false, failure: LlmFailure.REQUEST_FAILED, errorName: "TimeoutError" }],
    ["an HTTP error", { ok: false, failure: LlmFailure.HTTP_ERROR, status: 500, model: "m" }],
    ["no text", { ok: false, failure: LlmFailure.NO_TEXT }],
    ["invalid JSON", { ok: false, failure: LlmFailure.INVALID_JSON }],
    ["a JSON null answer", { ok: true, json: null }],
    ["candidates that are not a list", { ok: true, json: { candidates: "Comas" } }],
  ])("reports failed on %s", async (_label, outcome) => {
    await expect(resolveDistritoAiDetailed("comas", undefined, clientAnswering(outcome))).resolves.toEqual({
      outcome: "failed",
      candidates: [],
    });
  });

  it("with the AI disabled reports found or not_found from the fixed fallback", async () => {
    await expect(resolveDistritoAiDetailed("lurigancho", undefined, LLM_DISABLED)).resolves.toMatchObject({ outcome: "found" });
    await expect(resolveDistritoAiDetailed("nada", undefined, LLM_DISABLED)).resolves.toEqual({
      outcome: "not_found",
      candidates: [],
    });
  });
});

describe("AI tasks report a citizen's wish to leave (quiere_salir)", () => {
  const answering = (json: unknown) =>
    llmAvailable({
      provider: "gemini",
      generateJson: async (): Promise<LlmJsonOutcome> => ({ ok: true, json }),
    });

  it("resolveDistritoAiDetailed passes quiere_salir on as quiereSalir", async () => {
    const result = await resolveDistritoAiDetailed(
      "puff muchos pasos",
      undefined,
      answering({ candidates: [], detalle: "", quiere_salir: true }),
    );

    expect(result).toEqual({ outcome: "not_found", candidates: [], quiereSalir: true });
  });

  it("resolveFechaAi passes quiere_salir on as quiereSalir", async () => {
    const result = await resolveFechaAi(
      "ya me cansé",
      "2099-09-20",
      [{ id: "a", label: "22/09/2099" }],
      answering({ id: null, detalle: "", quiere_salir: true }),
    );

    expect(result).toEqual({ status: AiTaskStatus.ANSWERED, quiereSalir: true });
  });

  it("extractSelectionHints passes quiere_salir on as quiereSalir", async () => {
    const result = await extractSelectionHints(
      "especialidad",
      "mejor otro día",
      answering({ especialidad: null, establecimiento: null, detalle: "", quiere_salir: true }),
    );

    expect(result).toEqual({ status: AiTaskStatus.ANSWERED, quiereSalir: true });
  });

  it("quiere_salir false adds nothing to the result", async () => {
    const result = await resolveFechaAi(
      "el lunes",
      "2099-09-20",
      [{ id: "a", label: "22/09/2099" }],
      answering({ id: "a", detalle: "", quiere_salir: false }),
    );

    expect(result).toEqual({ status: AiTaskStatus.ANSWERED, id: "a" });
  });

  it.each([
    ["distrito", () => import("@/lib/fsm/parsing/ai/distrito")],
    ["fecha", () => import("@/lib/fsm/parsing/ai/fecha")],
    ["selection-hints", () => import("@/lib/fsm/parsing/ai/selection-hints")],
  ])("the %s prompt defines quiere_salir", async (_label, load) => {
    const prompts: string[] = [];
    const recording = llmAvailable({
      provider: "gemini",
      generateJson: async (request: LlmJsonRequest): Promise<LlmJsonOutcome> => {
        prompts.push(request.systemPrompt);
        return { ok: false, failure: LlmFailure.NO_TEXT };
      },
    });
    const mod = (await load()) as Record<string, unknown>;
    if ("resolveDistritoAiDetailed" in mod)
      await (mod.resolveDistritoAiDetailed as typeof resolveDistritoAiDetailed)("x", undefined, recording);
    if ("resolveFechaAi" in mod)
      await (mod.resolveFechaAi as typeof resolveFechaAi)("x", "2099-09-20", [{ id: "a", label: "l" }], recording);
    if ("extractSelectionHints" in mod) await (mod.extractSelectionHints as typeof extractSelectionHints)("especialidad", "x", recording);

    expect(prompts[0]).toContain("quiere_salir");
  });
});
