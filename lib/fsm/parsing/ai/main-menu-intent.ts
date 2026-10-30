import type { JsonSchema, LlmClientLookup } from "@/lib/fsm/parsing/ai/llm";
import { describeLlmFailure, logAiFallback, buildMisconfiguredProviderReason } from "@/lib/fsm/parsing/ai/ai-fallback";
import { MainMenuIntent } from "@/lib/enums/main-menu-intent";
import { mainMenuIntentSystemPrompt } from "@/lib/constants/prompts/main-menu-intent";
import { serviceCatalog } from "@/lib/services/service-catalog";
import { MenuChoice } from "@/lib/enums/menu-choice";
import { LlmClientStatus } from "@/lib/enums/llm-client-status";
import { QueryKind } from "@/lib/enums/query-kind";
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

const buildResponseSchema = (intents: readonly MainMenuIntent[]): JsonSchema => ({
  type: "object",
  properties: {
    intent: { type: "string", enum: [...intents] },
    especialidad: { type: "string" },
    distrito: { type: "string" },
    detalle: { type: "string" },
  },
  required: ["intent", "detalle"],
});

export const MAIN_MENU_INTENT_RESPONSE_SCHEMA: JsonSchema = buildResponseSchema([
  MainMenuIntent.CITA,
  MainMenuIntent.REFERENCIA,
  MainMenuIntent.INCIDENCIA,
  MainMenuIntent.FUERA_DE_ALCANCE,
  MainMenuIntent.UNCLEAR,
]);

const WITHOUT_INCIDENCIAS_RESPONSE_SCHEMA: JsonSchema = buildResponseSchema([
  MainMenuIntent.CITA,
  MainMenuIntent.REFERENCIA,
  MainMenuIntent.FUERA_DE_ALCANCE,
  MainMenuIntent.UNCLEAR,
]);

function unclearIntent(reason: string): MainMenuIntentResult {
  logAiFallback(QueryKind.ANALYZE_MAIN_MENU_INTENT, "menu", reason);
  return { intent: MainMenuIntent.UNCLEAR };
}

export async function analyzeMainMenuIntent(text: string, lookup: LlmClientLookup): Promise<MainMenuIntentResult> {
  const incidencias = serviceCatalog.isEnabled(MenuChoice.REGISTRAR_INCIDENCIA);

  if (lookup.status === LlmClientStatus.MISCONFIGURED) return unclearIntent(buildMisconfiguredProviderReason(lookup.provider));

  const outcome = await lookup.client.generateJson({
    operation: QueryKind.ANALYZE_MAIN_MENU_INTENT,
    systemPrompt: mainMenuIntentSystemPrompt(incidencias),
    userText: text,
    schema: incidencias ? MAIN_MENU_INTENT_RESPONSE_SCHEMA : WITHOUT_INCIDENCIAS_RESPONSE_SCHEMA,
  });
  if (!outcome.ok) return unclearIntent(describeLlmFailure(outcome));

  try {
    const parsed = outcome.json as MainMenuIntentJsonShape;
    const intent = stringOr(parsed.intent).trim().toLowerCase();
    if (intent === MainMenuIntent.FUERA_DE_ALCANCE) return { intent: MainMenuIntent.FUERA_DE_ALCANCE };
    if (intent === MainMenuIntent.REFERENCIA) return { intent: MainMenuIntent.REFERENCIA };
    if (intent === MainMenuIntent.INCIDENCIA && incidencias) return { intent: MainMenuIntent.INCIDENCIA };
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
