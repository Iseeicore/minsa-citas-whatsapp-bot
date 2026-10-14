import { afterEach, describe, expect, it, vi } from "vitest";
import { analyzeMainMenuIntent } from "@/lib/fsm/parsing/ai/main-menu-intent";
import type { LlmClient, LlmJsonOutcome, LlmJsonRequest } from "@/lib/fsm/parsing/ai/llm";

afterEach(() => {
  vi.unstubAllEnvs();
});

function recordingClient(json: unknown) {
  const requests: LlmJsonRequest[] = [];
  const client: LlmClient = {
    provider: "gemini",
    generateJson: async (request): Promise<LlmJsonOutcome> => {
      requests.push(request);
      return { ok: true, json };
    },
  };
  return { client, requests };
}

const intents = (request: LlmJsonRequest) => {
  const schema = request.schema;
  if (schema.type !== "object") throw new Error("expected an object schema");
  const intent = schema.properties.intent;
  return "enum" in intent ? intent.enum : undefined;
};

describe("analyzeMainMenuIntent with INCIDENCIAS_ENABLED on", () => {
  it("offers the incidencia to the model and returns it", async () => {
    vi.stubEnv("INCIDENCIAS_ENABLED", "true");
    const { client, requests } = recordingClient({ intent: "incidencia", detalle: "x" });

    await expect(analyzeMainMenuIntent("me trataron mal", client)).resolves.toEqual({ intent: "incidencia" });

    expect(intents(requests[0])).toEqual(["cita", "incidencia", "fuera_de_alcance", "unclear"]);
    expect(requests[0].systemPrompt).toContain('"intent": "incidencia"');
    expect(requests[0].systemPrompt).toContain("registrar una incidencia");
  });

  it("the offline stand-in still recognizes a complaint", async () => {
    vi.stubEnv("INCIDENCIAS_ENABLED", "true");

    await expect(analyzeMainMenuIntent("quiero poner un reclamo", null)).resolves.toEqual({ intent: "incidencia" });
  });
});

describe("analyzeMainMenuIntent with INCIDENCIAS_ENABLED off", () => {
  it("does not offer the incidencia: not in the schema, not in the prompt", async () => {
    vi.stubEnv("INCIDENCIAS_ENABLED", "false");
    const { client, requests } = recordingClient({ intent: "cita", detalle: "x" });

    await analyzeMainMenuIntent("quiero una cita", client);

    expect(intents(requests[0])).toEqual(["cita", "fuera_de_alcance", "unclear"]);
    expect(requests[0].systemPrompt).not.toMatch(/incidencia|reclamo|queja|denuncia/i);
    expect(requests[0].systemPrompt).toContain("agendar una cita");
  });

  it("maps an incidencia answer from the model to unclear", async () => {
    vi.stubEnv("INCIDENCIAS_ENABLED", "false");
    const { client } = recordingClient({ intent: "incidencia", detalle: "x" });

    await expect(analyzeMainMenuIntent("me trataron mal", client)).resolves.toEqual({ intent: "unclear" });
  });

  it("the offline stand-in does not turn a complaint into an incidencia", async () => {
    vi.stubEnv("INCIDENCIAS_ENABLED", "false");

    const result = await analyzeMainMenuIntent("quiero poner un reclamo", null);

    expect(result.intent).not.toBe("incidencia");
  });

  it("the cita and the out-of-scope answers keep working", async () => {
    vi.stubEnv("INCIDENCIAS_ENABLED", "false");

    await expect(analyzeMainMenuIntent("quiero una cita de pediatría", null)).resolves.toEqual({ intent: "cita", especialidad: "Pediatría" });
    await expect(
      analyzeMainMenuIntent("x", recordingClient({ intent: "fuera_de_alcance", detalle: "x" }).client),
    ).resolves.toEqual({ intent: "fuera_de_alcance" });
  });
});
