import type { JsonSchema, LlmClientLookup } from "@/lib/fsm/parsing/ai/llm";
import {
  ANSWER_NOT_OBJECT_REASON,
  describeLlmFailure,
  logAiFallback,
  buildMisconfiguredProviderReason,
} from "@/lib/fsm/parsing/ai/ai-fallback";
import { INCIDENCIA_FOTO_INTENT_SYSTEM_PROMPT } from "@/lib/constants/prompts/incidencia-foto-intent";
import { isRecord } from "@/lib/utils/type-guards";
import { AiTaskStatus } from "@/lib/enums/ai-task-status";
import { LlmClientStatus } from "@/lib/enums/llm-client-status";
import { QueryKind } from "@/lib/enums/query-kind";

export type FotoIntentResult = { status: AiTaskStatus.ANSWERED; quiereOmitir: boolean } | { status: AiTaskStatus.UNAVAILABLE };

const OPERATION = QueryKind.ANALYZE_INCIDENCIA_FOTO_INTENT;

export const INCIDENCIA_FOTO_INTENT_RESPONSE_SCHEMA: JsonSchema = {
  type: "object",
  properties: {
    quiere_omitir: { type: "boolean" },
    detalle: { type: "string" },
  },
  required: ["quiere_omitir", "detalle"],
};

function unavailable(reason: string): FotoIntentResult {
  logAiFallback(OPERATION, "await_foto", reason);
  return { status: AiTaskStatus.UNAVAILABLE };
}

export async function analyzeFotoIntent(text: string, lookup: LlmClientLookup): Promise<FotoIntentResult> {
  if (lookup.status === LlmClientStatus.MISCONFIGURED) return unavailable(buildMisconfiguredProviderReason(lookup.provider));

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
