import type { JsonSchema, LlmClient } from "@/lib/fsm/parsing/ai/llm";
import { getLlmClient } from "@/lib/fsm/parsing/ai/llm-registry";
import { DistritoAiOutcome } from "@/lib/enums/distrito-ai-outcome";
import { DISTRITO_AI_SYSTEM_PROMPT, distritoDirectAnswerLine, distritoInitialMessageLine } from "@/lib/constants/prompts/distrito";

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

const FAKE_DISTRITO_CANDIDATES: Record<string, DistritoAiCandidate[]> = {
  lurigancho: [{ departamento: "Lima", provincia: "Lima", distrito: "Lurigancho" }],
  miraflores: [
    { departamento: "Lima", provincia: "Lima", distrito: "Miraflores" },
    { departamento: "Arequipa", provincia: "Arequipa", distrito: "Miraflores" },
  ],
  "san juan": [
    { departamento: "Lima", provincia: "Lima", distrito: "San Juan de Lurigancho" },
    { departamento: "Lima", provincia: "Lima", distrito: "San Juan de Miraflores" },
    { departamento: "Lima", provincia: "Huarochirí", distrito: "San Juan de Iris" },
    { departamento: "Lima", provincia: "Huarochirí", distrito: "San Juan de Tantaranche" },
  ],
};

function isDistritoAiCandidate(value: unknown): value is DistritoAiCandidate {
  const candidate = value as Partial<DistritoAiCandidate> | null;
  return (
    typeof candidate?.departamento === "string" &&
    typeof candidate?.provincia === "string" &&
    typeof candidate?.distrito === "string"
  );
}

export async function resolveDistritoAiDetailed(
  distritoText: string,
  contextText?: string,
  llm: LlmClient | null = getLlmClient(),
): Promise<ResolveDistritoAiDetailedResult> {
  if (llm) {
    const userTurn = [
      distritoDirectAnswerLine(distritoText),
      contextText ? distritoInitialMessageLine(contextText) : null,
    ]
      .filter(Boolean)
      .join("\n");

    const outcome = await llm.generateJson({
      operation: "resolve_distrito_ai",
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

  const key = distritoText.trim().toLowerCase();
  const direct = FAKE_DISTRITO_CANDIDATES[key];
  if (direct) return withOutcome(direct);

  const haystack = `${distritoText} ${contextText ?? ""}`.toLowerCase();
  for (const [knownDistrito, candidates] of Object.entries(FAKE_DISTRITO_CANDIDATES)) {
    if (haystack.includes(knownDistrito)) {
      return withOutcome(candidates);
    }
  }

  return withOutcome([]);
}

export async function resolveDistritoAi(
  distritoText: string,
  contextText?: string,
  llm: LlmClient | null = getLlmClient(),
): Promise<ResolveDistritoAiResult> {
  const { candidates } = await resolveDistritoAiDetailed(distritoText, contextText, llm);
  return { candidates };
}
