import fs from "node:fs";
import path from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { PROMPT_GUARDRAILS } from "@/lib/constants/prompts/guardrails";
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

const intents = (request: LlmJsonRequest): string[] => JSON.parse(JSON.stringify(request.schema)).properties.intent.enum;

describe("analyzeMainMenuIntent with INCIDENCIAS_ENABLED on", () => {
  it("sends the prompt that the system had before the flag, byte for byte", async () => {
    vi.stubEnv("INCIDENCIAS_ENABLED", "true");
    const { client, requests } = recordingClient({ intent: "cita", detalle: "x" });
    const base = fs
      .readFileSync(path.join(process.cwd(), "tests", "support", "main-menu-intent-base-prompt.txt"), "utf8")
      .split("\r\n")
      .join("\n")
      .replace("{{GUARDRAILS}}", PROMPT_GUARDRAILS);

    await analyzeMainMenuIntent("quiero una cita", client);

    expect(requests[0].systemPrompt).toBe(base);
  });

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

describe("analyzeMainMenuIntent with INCIDENCIAS_ENABLED not defined", () => {
  it("does not offer the incidencia to the model", async () => {
    vi.stubEnv("INCIDENCIAS_ENABLED", undefined);
    const { client, requests } = recordingClient({ intent: "incidencia", detalle: "x" });

    await expect(analyzeMainMenuIntent("me trataron mal", client)).resolves.toEqual({ intent: "unclear" });

    expect(intents(requests[0])).toEqual(["cita", "fuera_de_alcance", "unclear"]);
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

  it("the offline stand-in does not turn a complaint into an incidencia: it stays unclear", async () => {
    vi.stubEnv("INCIDENCIAS_ENABLED", "false");

    await expect(analyzeMainMenuIntent("quiero poner un reclamo", null)).resolves.toEqual({ intent: "unclear" });
  });

  it("the offline stand-in reads a complaint that mentions atención as a cita, as it always did", async () => {
    vi.stubEnv("INCIDENCIAS_ENABLED", "false");

    await expect(analyzeMainMenuIntent("quiero un reclamo por mala atención", null)).resolves.toEqual({ intent: "cita" });
  });

  it("the cita and the out-of-scope answers keep working", async () => {
    vi.stubEnv("INCIDENCIAS_ENABLED", "false");

    await expect(analyzeMainMenuIntent("quiero una cita de pediatría", null)).resolves.toEqual({
      intent: "cita",
      especialidad: "Pediatría",
    });
    await expect(analyzeMainMenuIntent("x", recordingClient({ intent: "fuera_de_alcance", detalle: "x" }).client)).resolves.toEqual({
      intent: "fuera_de_alcance",
    });
  });
});
