import type { JsonSchema, LlmClientLookup } from "@/lib/fsm/parsing/ai/llm";
import {
  ANSWER_NOT_OBJECT_REASON,
  describeLlmFailure,
  logAiFallback,
  buildMisconfiguredProviderReason,
} from "@/lib/fsm/parsing/ai/ai-fallback";
import { SELECTION_HINTS_SYSTEM_PROMPT } from "@/lib/constants/prompts/selection-hints";
import { stringOrUndefined } from "@/lib/utils/text-values";
import { isRecord } from "@/lib/utils/type-guards";
import { AiTaskStatus } from "@/lib/enums/ai-task-status";
import { LlmClientStatus } from "@/lib/enums/llm-client-status";
import { QueryKind } from "@/lib/enums/query-kind";

export type SelectionHintsResult =
  | {
      status: AiTaskStatus.ANSWERED;
      especialidad?: string;
      establecimiento?: string;
      quiereSalir?: true;
      quiereCambiarDistrito?: true;
    }
  | { status: AiTaskStatus.UNAVAILABLE };

const OPERATION = QueryKind.EXTRACT_SELECTION_HINTS;

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

function unavailable(reason: string): SelectionHintsResult {
  logAiFallback(OPERATION, "reprompt", reason);
  return { status: AiTaskStatus.UNAVAILABLE };
}

export async function extractSelectionHints(_step: string, text: string, lookup: LlmClientLookup): Promise<SelectionHintsResult> {
  if (!text.trim()) return { status: AiTaskStatus.ANSWERED };
  if (lookup.status === LlmClientStatus.MISCONFIGURED) return unavailable(buildMisconfiguredProviderReason(lookup.provider));

  const outcome = await lookup.client.generateJson({
    operation: OPERATION,
    systemPrompt: SELECTION_HINTS_SYSTEM_PROMPT,
    userText: text,
    schema: SELECTION_HINTS_RESPONSE_SCHEMA,
  });
  if (!outcome.ok) return unavailable(describeLlmFailure(outcome));
  if (!isRecord(outcome.json)) return unavailable(ANSWER_NOT_OBJECT_REASON);

  const parsed = outcome.json;
  const hints: SelectionHintsResult = {
    status: AiTaskStatus.ANSWERED,
    especialidad: stringOrUndefined(parsed.especialidad),
    establecimiento: stringOrUndefined(parsed.establecimiento),
  };
  if (parsed.quiere_salir === true) return { ...hints, quiereSalir: true };
  return parsed.quiere_cambiar_distrito === true ? { ...hints, quiereCambiarDistrito: true } : hints;
}
