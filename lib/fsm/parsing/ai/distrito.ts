import type { JsonSchema, LlmClientLookup } from "@/lib/fsm/parsing/ai/llm";
import {
  ANSWER_NOT_OBJECT_REASON,
  CANDIDATES_NOT_LIST_REASON,
  describeLlmFailure,
  logAiFallback,
  buildMisconfiguredProviderReason,
} from "@/lib/fsm/parsing/ai/ai-fallback";
import { LlmClientStatus } from "@/lib/enums/llm-client-status";
import { QueryKind } from "@/lib/enums/query-kind";
import { DistritoAiOutcome } from "@/lib/enums/distrito-ai-outcome";
import { DISTRITO_AI_SYSTEM_PROMPT, distritoDirectAnswerLine, distritoInitialMessageLine } from "@/lib/constants/prompts/distrito";
import { isRecord, isString } from "@/lib/utils/type-guards";

export type DistritoAiCandidate = {
  departamento: string;
  provincia: string;
  distrito: string;
};

export type ResolveDistritoAiResult = {
  candidates: DistritoAiCandidate[];
};

export type { DistritoAiOutcome };

export type ResolveDistritoAiDetailedResult = ResolveDistritoAiResult & { outcome: DistritoAiOutcome; quiereSalir?: true };

const FAILED: ResolveDistritoAiDetailedResult = { outcome: DistritoAiOutcome.FAILED, candidates: [] };

const withOutcome = (candidates: DistritoAiCandidate[]): ResolveDistritoAiDetailedResult => ({
  outcome: candidates.length > 0 ? DistritoAiOutcome.FOUND : DistritoAiOutcome.NOT_FOUND,
  candidates,
});

export const DISTRITO_AI_RESPONSE_SCHEMA: JsonSchema = {
  type: "object",
  properties: {
    candidates: {
      type: "array",
      items: {
        type: "object",
        properties: {
          departamento: { type: "string" },
          provincia: { type: "string" },
          distrito: { type: "string" },
        },
        required: ["departamento", "provincia", "distrito"],
      },
    },
    detalle: { type: "string" },
    quiere_salir: { type: "boolean" },
  },
  required: ["candidates", "detalle", "quiere_salir"],
};

function failed(reason: string): ResolveDistritoAiDetailedResult {
  logAiFallback(QueryKind.RESOLVE_DISTRITO_AI, "failed", reason);
  return FAILED;
}

function isDistritoAiCandidate(value: unknown): value is DistritoAiCandidate {
  const candidate = value as Partial<DistritoAiCandidate> | null;
  return isString(candidate?.departamento) && isString(candidate?.provincia) && isString(candidate?.distrito);
}

export async function resolveDistritoAiDetailed(
  distritoText: string,
  contextText: string | undefined,
  lookup: LlmClientLookup,
): Promise<ResolveDistritoAiDetailedResult> {
  if (lookup.status === LlmClientStatus.MISCONFIGURED) return failed(buildMisconfiguredProviderReason(lookup.provider));

  const userTurn = [distritoDirectAnswerLine(distritoText), contextText ? distritoInitialMessageLine(contextText) : null]
    .filter(Boolean)
    .join("\n");

  const outcome = await lookup.client.generateJson({
    operation: QueryKind.RESOLVE_DISTRITO_AI,
    systemPrompt: DISTRITO_AI_SYSTEM_PROMPT,
    userText: userTurn,
    schema: DISTRITO_AI_RESPONSE_SCHEMA,
  });
  if (!outcome.ok) return failed(describeLlmFailure(outcome));
  if (!isRecord(outcome.json)) return failed(ANSWER_NOT_OBJECT_REASON);

  const parsed = outcome.json;
  if (!Array.isArray(parsed.candidates)) return failed(CANDIDATES_NOT_LIST_REASON);

  const resolved = withOutcome(parsed.candidates.filter(isDistritoAiCandidate));
  return parsed.quiere_salir === true ? { ...resolved, quiereSalir: true } : resolved;
}

export async function resolveDistritoAi(
  distritoText: string,
  contextText: string | undefined,
  lookup: LlmClientLookup,
): Promise<ResolveDistritoAiResult> {
  const { candidates } = await resolveDistritoAiDetailed(distritoText, contextText, lookup);
  return { candidates };
}
