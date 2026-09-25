import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { resolveDistritoAi } from "@/lib/fsm/parsing/ai/distrito";
import { resolveFechaAi } from "@/lib/fsm/parsing/ai/fecha";
import { extractSelectionHints } from "@/lib/fsm/parsing/ai/selection-hints";

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
