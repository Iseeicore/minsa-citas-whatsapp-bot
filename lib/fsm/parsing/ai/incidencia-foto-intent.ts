import { normalizeText } from "@/lib/fsm/parsing/text/text";
import type { JsonSchema, LlmClientLookup } from "@/lib/fsm/parsing/ai/llm";
import { lookupLlmClient } from "@/lib/fsm/parsing/ai/llm-registry";
import { ANSWER_NOT_OBJECT_REASON, describeLlmFailure, logAiFallback, misconfiguredProviderReason } from "@/lib/fsm/parsing/ai/ai-fallback";
import { OMITIR_KEYWORD } from "@/lib/constants/textos/incidencia";
import { INCIDENCIA_FOTO_INTENT_SYSTEM_PROMPT } from "@/lib/constants/prompts/incidencia-foto-intent";
import { isRecord } from "@/lib/utils/type-guards";
import { AiTaskStatus } from "@/lib/enums/ai-task-status";
import { LlmClientStatus } from "@/lib/enums/llm-client-status";

export type FotoIntentResult = { status: AiTaskStatus.ANSWERED; quiereOmitir: boolean } | { status: AiTaskStatus.UNAVAILABLE };

const OPERATION = "analyze_incidencia_foto_intent";

export const INCIDENCIA_FOTO_INTENT_RESPONSE_SCHEMA: JsonSchema = {
  type: "object",
  properties: {
    quiere_omitir: { type: "boolean" },
    detalle: { type: "string" },
  },
  required: ["quiere_omitir", "detalle"],
};

const FAKE_OMITIR_KEYWORDS = [OMITIR_KEYWORD, "NO QUIERO", "NO DESEO", "NO TENGO", "PREFIERO NO", "PASO", "SIN FOTO", "NO HACE FALTA"];

function unavailable(reason: string): FotoIntentResult {
  logAiFallback(OPERATION, "await_foto", reason);
  return { status: AiTaskStatus.UNAVAILABLE };
}

export async function analyzeFotoIntent(text: string, lookup: LlmClientLookup = lookupLlmClient()): Promise<FotoIntentResult> {
  if (lookup.status === LlmClientStatus.MISCONFIGURED) return unavailable(misconfiguredProviderReason(lookup.provider));

  if (lookup.status === LlmClientStatus.DISABLED) {
    const normalized = normalizeText(text);
    return {
      status: AiTaskStatus.ANSWERED,
      quiereOmitir: FAKE_OMITIR_KEYWORDS.some((keyword) => normalized.includes(normalizeText(keyword))),
    };
  }

  const outcome = await lookup.client.generateJson({
    operation: OPERATION,
    systemPrompt: INCIDENCIA_FOTO_INTENT_SYSTEM_PROMPT,
    userText: text,
    schema: INCIDENCIA_FOTO_INTENT_RESPONSE_SCHEMA,
  });
  if (!outcome.ok) return unavailable(describeLlmFailure(outcome));
  if (!isRecord(outcome.json)) return unavailable(ANSWER_NOT_OBJECT_REASON);

  return { status: AiTaskStatus.ANSWERED, quiereOmitir: outcome.json.quiere_omitir === true };
}
