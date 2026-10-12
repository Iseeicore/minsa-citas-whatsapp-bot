import type { JsonSchema, LlmClient } from "@/lib/fsm/parsing/ai/llm";
import { getLlmClient } from "@/lib/fsm/parsing/ai/llm-registry";
import { FECHA_AI_SYSTEM_PROMPT, FECHA_OPTIONS_HEADER, fechaTodayLine, fechaOptionLine, fechaRequestLine } from "@/lib/constants/prompts/fecha";

export type FechaAiOption = { id: string; label: string };
export type FechaAiResult = { id?: string; quiereSalir?: true };

export const FECHA_AI_RESPONSE_SCHEMA: JsonSchema = {
  type: "object",
  properties: {
    id: { type: ["string", "null"] },
    detalle: { type: "string" },
    quiere_salir: { type: "boolean" },
  },
  required: ["detalle", "quiere_salir"],
};

export async function resolveFechaAi(
  text: string,
  today: string,
  options: FechaAiOption[],
  llm: LlmClient | null = getLlmClient(),
): Promise<FechaAiResult> {
  if (options.length === 0) return {};

  if (llm) {
    const userTurn = [
      fechaTodayLine(today),
      FECHA_OPTIONS_HEADER,
      ...options.map((option) => fechaOptionLine(option.id, option.label)),
      fechaRequestLine(text),
    ].join("\n");

    const outcome = await llm.generateJson({
      operation: "resolve_fecha_ai",
      systemPrompt: FECHA_AI_SYSTEM_PROMPT,
      userText: userTurn,
      schema: FECHA_AI_RESPONSE_SCHEMA,
    });
    if (!outcome.ok) return {};

    try {
      const parsed = outcome.json as { id?: unknown; quiere_salir?: unknown };
      const offered = options.some((option) => option.id === parsed.id);
      const picked: FechaAiResult = typeof parsed.id === "string" && offered ? { id: parsed.id } : {};
      return parsed.quiere_salir === true ? { ...picked, quiereSalir: true } : picked;
    } catch {
      return {};
    }
  }

  return {};
}
