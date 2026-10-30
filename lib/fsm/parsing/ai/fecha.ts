import type { JsonSchema, LlmClientLookup } from "@/lib/fsm/parsing/ai/llm";
import { lookupLlmClient } from "@/lib/fsm/parsing/ai/llm-registry";
import { ANSWER_NOT_OBJECT_REASON, describeLlmFailure, logAiFallback, misconfiguredProviderReason } from "@/lib/fsm/parsing/ai/ai-fallback";
import {
  FECHA_AI_SYSTEM_PROMPT,
  FECHA_OPTIONS_HEADER,
  fechaTodayLine,
  fechaOptionLine,
  fechaRequestLine,
} from "@/lib/constants/prompts/fecha";
import { isRecord, isString } from "@/lib/utils/type-guards";
import { AiTaskStatus } from "@/lib/enums/ai-task-status";
import { LlmClientStatus } from "@/lib/enums/llm-client-status";

export type FechaAiOption = { id: string; label: string };
export type FechaAiResult = { status: AiTaskStatus.ANSWERED; id?: string; quiereSalir?: true } | { status: AiTaskStatus.UNAVAILABLE };

const OPERATION = "resolve_fecha_ai";

export const FECHA_AI_RESPONSE_SCHEMA: JsonSchema = {
  type: "object",
  properties: {
    id: { type: ["string", "null"] },
    detalle: { type: "string" },
    quiere_salir: { type: "boolean" },
  },
  required: ["detalle", "quiere_salir"],
};

function unavailable(reason: string): FechaAiResult {
  logAiFallback(OPERATION, "reprompt", reason);
  return { status: AiTaskStatus.UNAVAILABLE };
}

export async function resolveFechaAi(
  text: string,
  today: string,
  options: FechaAiOption[],
  lookup: LlmClientLookup = lookupLlmClient(),
): Promise<FechaAiResult> {
  if (options.length === 0) return { status: AiTaskStatus.ANSWERED };
  if (lookup.status === LlmClientStatus.DISABLED) return { status: AiTaskStatus.ANSWERED };
  if (lookup.status === LlmClientStatus.MISCONFIGURED) return unavailable(misconfiguredProviderReason(lookup.provider));

  const userTurn = [
    fechaTodayLine(today),
    FECHA_OPTIONS_HEADER,
    ...options.map((option) => fechaOptionLine(option.id, option.label)),
    fechaRequestLine(text),
  ].join("\n");

  const outcome = await lookup.client.generateJson({
    operation: OPERATION,
    systemPrompt: FECHA_AI_SYSTEM_PROMPT,
    userText: userTurn,
    schema: FECHA_AI_RESPONSE_SCHEMA,
  });
  if (!outcome.ok) return unavailable(describeLlmFailure(outcome));
  if (!isRecord(outcome.json)) return unavailable(ANSWER_NOT_OBJECT_REASON);

  const parsed = outcome.json;
  const offered = options.some((option) => option.id === parsed.id);
  const picked: FechaAiResult =
    isString(parsed.id) && offered ? { status: AiTaskStatus.ANSWERED, id: parsed.id } : { status: AiTaskStatus.ANSWERED };
  return parsed.quiere_salir === true ? { ...picked, quiereSalir: true } : picked;
}
