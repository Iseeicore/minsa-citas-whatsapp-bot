import { normalizeText } from "@/lib/fsm/parsing/text/text";
import type { JsonSchema, LlmClient } from "@/lib/fsm/parsing/ai/llm";
import { getLlmClient } from "@/lib/fsm/parsing/ai/llm-registry";
import { OMITIR_KEYWORD } from "@/lib/constants/textos/incidencia";
import { INCIDENCIA_FOTO_INTENT_SYSTEM_PROMPT } from "@/lib/constants/prompts/incidencia-foto-intent";

export type FotoIntentResult = { quiereOmitir: boolean };

export const INCIDENCIA_FOTO_INTENT_RESPONSE_SCHEMA: JsonSchema = {
  type: "object",
  properties: {
    quiere_omitir: { type: "boolean" },
    detalle: { type: "string" },
  },
  required: ["quiere_omitir", "detalle"],
};

const FAKE_OMITIR_KEYWORDS = [OMITIR_KEYWORD, "NO QUIERO", "NO DESEO", "NO TENGO", "PREFIERO NO", "PASO", "SIN FOTO", "NO HACE FALTA"];

export async function analyzeFotoIntent(
  text: string,
  llm: LlmClient | null = getLlmClient(),
): Promise<FotoIntentResult> {
  if (llm) {
    const outcome = await llm.generateJson({
      operation: "analyze_incidencia_foto_intent",
      systemPrompt: INCIDENCIA_FOTO_INTENT_SYSTEM_PROMPT,
      userText: text,
      schema: INCIDENCIA_FOTO_INTENT_RESPONSE_SCHEMA,
    });
    if (!outcome.ok) return { quiereOmitir: false };

    try {
      const parsed = outcome.json as { quiere_omitir?: unknown };
      return { quiereOmitir: parsed.quiere_omitir === true };
    } catch {
      return { quiereOmitir: false };
    }
  }

  const normalized = normalizeText(text);
  return { quiereOmitir: FAKE_OMITIR_KEYWORDS.some((keyword) => normalized.includes(normalizeText(keyword))) };
}
