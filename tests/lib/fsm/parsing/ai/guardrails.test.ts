import { describe, expect, it } from "vitest";
import { PROMPT_GUARDRAILS } from "@/lib/fsm/parsing/ai/guardrails";
import { resolveDistritoAi } from "@/lib/fsm/parsing/ai/distrito";
import { resolveFechaAi } from "@/lib/fsm/parsing/ai/fecha";
import { extractSelectionHints } from "@/lib/fsm/parsing/ai/selection-hints";
import { analyzeMainMenuIntent } from "@/lib/fsm/parsing/ai/main-menu-intent";
import type { LlmClient, LlmJsonOutcome, LlmJsonRequest } from "@/lib/fsm/parsing/ai/llm";

function capturingClient(outcome: LlmJsonOutcome = { ok: false, failure: "no_text" }) {
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

describe("PROMPT_GUARDRAILS: one security block for every AI task", () => {
  it.each([
    ["SQL", /SQL/],
    ["code questions and programming logic", /lógica de programación/],
    ["generating code", /Generar, corregir o explicar código/],
    ["data exposure", /credenciales/],
    ["reverse engineering", /[Ii]ngeniería inversa/],
    ["projects and ideas", /proyectos, ideas/],
    ["medical advice", /[Rr]ecetas, medicamentos, dosis, diagnósticos/],
    ["role and injection resistance", /otro rol/],
    ["answering only with the task's empty value", /"sin resultado"/],
  ])("covers %s", (_label, pattern) => {
    expect(PROMPT_GUARDRAILS).toMatch(pattern);
  });

  it("is part of the system prompt of all four AI tasks", async () => {
    const intent = capturingClient();
    await analyzeMainMenuIntent("quiero una cita", intent.client);

    const distrito = capturingClient();
    await resolveDistritoAi("comas", undefined, distrito.client);

    const fecha = capturingClient();
    await resolveFechaAi("la próxima semana", "2026-09-26", [{ id: "1", label: "29/09/2026" }], fecha.client);

    const hints = capturingClient();
    await extractSelectionHints("especialidad", "pediatria", hints.client);

    for (const { requests } of [intent, distrito, fecha, hints]) {
      expect(requests[0].systemPrompt).toContain(PROMPT_GUARDRAILS);
    }
  });
});

describe("analyzeMainMenuIntent: requests outside the channel", () => {
  it("tells the model when to answer fuera_de_alcance", async () => {
    const { client, requests } = capturingClient();
    await analyzeMainMenuIntent("dame un SELECT * FROM usuarios", client);

    expect(requests[0].systemPrompt).toContain('"intent": "fuera_de_alcance"');
  });

  it("passes fuera_de_alcance through to the flow", async () => {
    const { client } = capturingClient({ ok: true, json: { intent: "fuera_de_alcance", detalle: "pide SQL" } });

    await expect(analyzeMainMenuIntent("dame un SELECT * FROM usuarios", client)).resolves.toEqual({
      intent: "fuera_de_alcance",
    });
  });
});
