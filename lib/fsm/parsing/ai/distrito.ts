import type { JsonSchema, LlmClientLookup } from "@/lib/fsm/parsing/ai/llm";
import { logAiFallback, buildMisconfiguredProviderReason } from "@/lib/fsm/parsing/ai/ai-fallback";
import { LlmClientStatus } from "@/lib/enums/llm-client-status";
import { QueryKind } from "@/lib/enums/query-kind";
import { DistritoAiOutcome } from "@/lib/enums/distrito-ai-outcome";
import { DISTRITO_AI_SYSTEM_PROMPT, distritoDirectAnswerLine, distritoInitialMessageLine } from "@/lib/constants/prompts/distrito";
import { isString } from "@/lib/utils/type-guards";

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

type DistritoAiJsonShape = {
  candidates?: unknown;
  detalle?: string;
  quiere_salir?: unknown;
};

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

function isDistritoAiCandidate(value: unknown): value is DistritoAiCandidate {
  const candidate = value as Partial<DistritoAiCandidate> | null;
  return isString(candidate?.departamento) && isString(candidate?.provincia) && isString(candidate?.distrito);
}

export async function resolveDistritoAiDetailed(
  distritoText: string,
  contextText: string | undefined,
  lookup: LlmClientLookup,
): Promise<ResolveDistritoAiDetailedResult> {
  if (lookup.status === LlmClientStatus.MISCONFIGURED) {
    logAiFallback(QueryKind.RESOLVE_DISTRITO_AI, "failed", buildMisconfiguredProviderReason(lookup.provider));
    return FAILED;
  }

  const userTurn = [distritoDirectAnswerLine(distritoText), contextText ? distritoInitialMessageLine(contextText) : null]
    .filter(Boolean)
    .join("\n");

  const outcome = await lookup.client.generateJson({
    operation: QueryKind.RESOLVE_DISTRITO_AI,
    systemPrompt: DISTRITO_AI_SYSTEM_PROMPT,
    userText: userTurn,
    schema: DISTRITO_AI_RESPONSE_SCHEMA,
  });
  if (!outcome.ok) return FAILED;

  try {
    const parsed = outcome.json as DistritoAiJsonShape;
    if (!Array.isArray(parsed.candidates)) return FAILED;

    const resolved = withOutcome(parsed.candidates.filter(isDistritoAiCandidate));
    return parsed.quiere_salir === true ? { ...resolved, quiereSalir: true } : resolved;
  } catch {
    return FAILED;
  }
}

export async function resolveDistritoAi(
  distritoText: string,
  contextText: string | undefined,
  lookup: LlmClientLookup,
): Promise<ResolveDistritoAiResult> {
  const { candidates } = await resolveDistritoAiDetailed(distritoText, contextText, lookup);
  return { candidates };
}
