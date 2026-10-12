import { logger } from "@/lib/observability/logger";
import { normalizeText } from "@/lib/fsm/parsing/text/text";
import type { JsonSchema, LlmClient } from "@/lib/fsm/parsing/ai/llm";
import { getLlmClient } from "@/lib/fsm/parsing/ai/llm-registry";
import { MainMenuIntent } from "@/lib/enums/main-menu-intent";
import { MAIN_MENU_INTENT_SYSTEM_PROMPT } from "@/lib/constants/prompts/main-menu-intent";
import { LlmFailure } from "@/lib/enums/llm-failure";
import { stringOr, stringOrUndefined } from "@/lib/utils/text-values";

export type MainMenuIntentResult = {
  intent: MainMenuIntent;
  especialidad?: string;
  distrito?: string;
};

type MainMenuIntentJsonShape = {
  intent?: unknown;
  especialidad?: unknown;
  distrito?: unknown;
  detalle?: string;
};

export const MAIN_MENU_INTENT_RESPONSE_SCHEMA: JsonSchema = {
  type: "object",
  properties: {
    intent: { type: "string", enum: ["cita", "incidencia", "fuera_de_alcance", "unclear"] },
    especialidad: { type: "string" },
    distrito: { type: "string" },
    detalle: { type: "string" },
  },
  required: ["intent", "detalle"],
};

const FAKE_ESPECIALIDAD_KEYWORDS: Record<string, string> = {
  ODONTOLOG: "Odontología",
  "MEDICINA GENERAL": "Medicina General",
  PEDIATR: "Pediatría",
  GINECOLOG: "Ginecología",
};

const FAKE_CITA_INTENT_KEYWORDS = ["CITA", "ATENCION", "CONSULTA", "TURNO", "MEDICO", "ATIENDAN"];
const FAKE_INCIDENCIA_STEMS = ["INCIDENCI", "RECLAM", "QUEJ", "DENUNCI"];

function unclearIntent(reason: string): MainMenuIntentResult {
  logger.warn("ai.fallback", { operation: "analyze_main_menu_intent", fellBackTo: "menu", reason });
  return { intent: MainMenuIntent.UNCLEAR };
}

export async function analyzeMainMenuIntent(
  text: string,
  llm: LlmClient | null = getLlmClient(),
): Promise<MainMenuIntentResult> {
  if (llm) {
    const outcome = await llm.generateJson({
      operation: "analyze_main_menu_intent",
      systemPrompt: MAIN_MENU_INTENT_SYSTEM_PROMPT,
      userText: text,
      schema: MAIN_MENU_INTENT_RESPONSE_SCHEMA,
    });
    if (!outcome.ok) {
      switch (outcome.failure) {
        case LlmFailure.REQUEST_FAILED:
          return unclearIntent(`request failed (${outcome.errorName})`);
        case LlmFailure.HTTP_ERROR:
          return unclearIntent(`HTTP ${outcome.status} from model ${outcome.model}`);
        case LlmFailure.NO_TEXT:
          return unclearIntent("no text in the response");
        default:
          return unclearIntent("response was not valid JSON");
      }
    }

    try {
      const parsed = outcome.json as MainMenuIntentJsonShape;
      const intent = stringOr(parsed.intent).trim().toLowerCase();
      if (intent === MainMenuIntent.FUERA_DE_ALCANCE) return { intent: MainMenuIntent.FUERA_DE_ALCANCE };
      if (intent === MainMenuIntent.INCIDENCIA) return { intent: MainMenuIntent.INCIDENCIA };
      if (intent !== MainMenuIntent.CITA) return { intent: MainMenuIntent.UNCLEAR };

      return {
        intent: MainMenuIntent.CITA,
        especialidad: stringOrUndefined(parsed.especialidad),
        distrito: stringOrUndefined(parsed.distrito),
      };
    } catch {
      return unclearIntent("response was not valid JSON");
    }
  }

  const normalized = normalizeText(text);
  if (FAKE_INCIDENCIA_STEMS.some((stem) => normalized.includes(stem))) return { intent: MainMenuIntent.INCIDENCIA };
  const looksLikeCita = FAKE_CITA_INTENT_KEYWORDS.some((keyword) => normalized.includes(keyword));
  if (!looksLikeCita) return { intent: MainMenuIntent.UNCLEAR };

  for (const [keyword, especialidad] of Object.entries(FAKE_ESPECIALIDAD_KEYWORDS)) {
    if (normalized.includes(keyword)) {
      return { intent: MainMenuIntent.CITA, especialidad };
    }
  }

  return { intent: MainMenuIntent.CITA };
}
