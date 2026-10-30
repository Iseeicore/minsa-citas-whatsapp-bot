import { describe, expect, it } from "vitest";
import { createFakeLlmClient } from "@/lib/fsm/parsing/ai/providers/fake";
import type { JsonSchema } from "@/lib/fsm/parsing/ai/llm";
import { QueryKind } from "@/lib/enums/query-kind";

const ANY_SCHEMA: JsonSchema = { type: "object", properties: {} };

const ask = (operation: string, userText: string, schema: JsonSchema = ANY_SCHEMA) =>
  createFakeLlmClient().generateJson({ operation, systemPrompt: "", userText, schema });

describe("the fake LLM adapter answers every AI task without calling a model", () => {
  it("is named fake", () => {
    expect(createFakeLlmClient().provider).toBe("fake");
  });

  it.each([
    ["no deseo", true],
    ["sin foto por favor", true],
    ["hola, buen día", false],
  ])("the evidence task reads %j as wanting to skip: %s", async (text, quiereOmitir) => {
    await expect(ask(QueryKind.ANALYZE_INCIDENCIA_FOTO_INTENT, text)).resolves.toEqual({
      ok: true,
      json: { quiere_omitir: quiereOmitir, detalle: "" },
    });
  });

  it("the date task never picks a date nor asks to leave", async () => {
    await expect(ask(QueryKind.RESOLVE_FECHA_AI, "el lunes")).resolves.toEqual({
      ok: true,
      json: { id: null, detalle: "", quiere_salir: false },
    });
  });

  it("the selection task finds no hints", async () => {
    await expect(ask(QueryKind.EXTRACT_SELECTION_HINTS, "pediatria")).resolves.toEqual({
      ok: true,
      json: { especialidad: null, establecimiento: null, detalle: "", quiere_salir: false },
    });
  });

  it("the district task knows a few fixed districts, by the answer or by the first message", async () => {
    await expect(ask(QueryKind.RESOLVE_DISTRITO_AI, "Respuesta directa: Lurigancho")).resolves.toEqual({
      ok: true,
      json: { candidates: [{ departamento: "Lima", provincia: "Lima", distrito: "Lurigancho" }], detalle: "", quiere_salir: false },
    });
    await expect(
      ask(QueryKind.RESOLVE_DISTRITO_AI, "Respuesta directa: por aqui\nMensaje inicial: vivo en miraflores"),
    ).resolves.toMatchObject({ ok: true, json: { candidates: [{ distrito: "Miraflores" }, { distrito: "Miraflores" }] } });
    await expect(ask(QueryKind.RESOLVE_DISTRITO_AI, "Respuesta directa: nada")).resolves.toEqual({
      ok: true,
      json: { candidates: [], detalle: "", quiere_salir: false },
    });
  });

  it("an unknown task answers an empty object", async () => {
    await expect(ask("otra_tarea", "hola")).resolves.toEqual({ ok: true, json: {} });
  });
});
