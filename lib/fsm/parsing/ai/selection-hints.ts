import type { JsonSchema, LlmClient } from "@/lib/fsm/parsing/ai/llm";
import { getLlmClient } from "@/lib/fsm/parsing/ai/llm-registry";
import { SELECTION_HINTS_SYSTEM_PROMPT } from "@/lib/constants/prompts/selection-hints";

export type SelectionHintsResult = {
  especialidad?: string;
  establecimiento?: string;
  quiereSalir?: true;
  quiereCambiarDistrito?: true;
};

export const SELECTION_HINTS_RESPONSE_SCHEMA: JsonSchema = {
  type: "object",
  properties: {
    especialidad: { type: ["string", "null"] },
    establecimiento: { type: ["string", "null"] },
    detalle: { type: "string" },
    quiere_salir: { type: "boolean" },
    quiere_cambiar_distrito: { type: "boolean" },
  },
  required: ["detalle", "quiere_salir"],
};

export async function extractSelectionHints(
  _step: string,
  text: string,
  llm: LlmClient | null = getLlmClient(),
): Promise<SelectionHintsResult> {
  if (!text.trim()) return {};

  if (llm) {
    const outcome = await llm.generateJson({
      operation: "extract_selection_hints",
      systemPrompt: SELECTION_HINTS_SYSTEM_PROMPT,
      userText: text,
      schema: SELECTION_HINTS_RESPONSE_SCHEMA,
    });
    if (!outcome.ok) return {};

    try {
      const parsed = outcome.json as {
        especialidad?: unknown;
        establecimiento?: unknown;
        quiere_salir?: unknown;
        quiere_cambiar_distrito?: unknown;
      };
      const hints: SelectionHintsResult = {
        especialidad: typeof parsed.especialidad === "string" ? parsed.especialidad : undefined,
        establecimiento: typeof parsed.establecimiento === "string" ? parsed.establecimiento : undefined,
      };
      if (parsed.quiere_salir === true) return { ...hints, quiereSalir: true };
      return parsed.quiere_cambiar_distrito === true ? { ...hints, quiereCambiarDistrito: true } : hints;
    } catch {
      return {};
    }
  }

  return {};
}
