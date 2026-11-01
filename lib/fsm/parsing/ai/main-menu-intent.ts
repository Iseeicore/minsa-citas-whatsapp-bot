import type { JsonSchema, LlmClientLookup } from "@/lib/fsm/parsing/ai/llm";
import {
  ANSWER_NOT_OBJECT_REASON,
  describeLlmFailure,
  logAiFallback,
  buildMisconfiguredProviderReason,
} from "@/lib/fsm/parsing/ai/ai-fallback";
import { MainMenuIntent } from "@/lib/enums/main-menu-intent";
import { mainMenuIntentSystemPrompt } from "@/lib/constants/prompts/main-menu-intent";
import { currentServiceOffer } from "@/lib/services/service-offer";
import { ServiceOffer } from "@/lib/enums/service-offer";
import { LlmClientStatus } from "@/lib/enums/llm-client-status";
import { QueryKind } from "@/lib/enums/query-kind";
import { stringOr, stringOrUndefined } from "@/lib/utils/text-values";
import { isRecord } from "@/lib/utils/type-guards";

export type MainMenuIntentResult = {
  intent: MainMenuIntent;
  especialidad?: string;
  distrito?: string;
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

const OFFERED_INTENTS: Readonly<Record<ServiceOffer, readonly MainMenuIntent[]>> = {
  [ServiceOffer.COMPLETA]: [MainMenuIntent.REFERENCIA, MainMenuIntent.INCIDENCIA],
  [ServiceOffer.CITA_REFERENCIA]: [MainMenuIntent.REFERENCIA],
  [ServiceOffer.CITA_INCIDENCIA]: [MainMenuIntent.INCIDENCIA],
  [ServiceOffer.CITA]: [],
};

const intentsFor = (offer: ServiceOffer): readonly MainMenuIntent[] => [
  MainMenuIntent.CITA,
  ...OFFERED_INTENTS[offer],
  MainMenuIntent.FUERA_DE_ALCANCE,
  MainMenuIntent.UNCLEAR,
];

export const MAIN_MENU_INTENT_RESPONSE_SCHEMA: JsonSchema = buildResponseSchema(intentsFor(ServiceOffer.COMPLETA));

function unclearIntent(reason: string): MainMenuIntentResult {
  logAiFallback(QueryKind.ANALYZE_MAIN_MENU_INTENT, "menu", reason);
  return { intent: MainMenuIntent.UNCLEAR };
}

export async function analyzeMainMenuIntent(text: string, lookup: LlmClientLookup): Promise<MainMenuIntentResult> {
  const offer = currentServiceOffer();
  const intents = intentsFor(offer);

  if (lookup.status === LlmClientStatus.MISCONFIGURED) return unclearIntent(buildMisconfiguredProviderReason(lookup.provider));

  const outcome = await lookup.client.generateJson({
    operation: QueryKind.ANALYZE_MAIN_MENU_INTENT,
    systemPrompt: mainMenuIntentSystemPrompt(offer, intents),
    userText: text,
    schema: buildResponseSchema(intents),
  });
  if (!outcome.ok) return unclearIntent(describeLlmFailure(outcome));
  if (!isRecord(outcome.json)) return unclearIntent(ANSWER_NOT_OBJECT_REASON);

  const parsed = outcome.json;
  const intent = stringOr(parsed.intent).trim().toLowerCase();
  if (intent === MainMenuIntent.FUERA_DE_ALCANCE) return { intent: MainMenuIntent.FUERA_DE_ALCANCE };
  const offered = intents.find((candidate) => candidate === intent);
  if (offered === MainMenuIntent.REFERENCIA || offered === MainMenuIntent.INCIDENCIA) return { intent: offered };
  if (intent !== MainMenuIntent.CITA) return { intent: MainMenuIntent.UNCLEAR };

  return {
    intent: MainMenuIntent.CITA,
    especialidad: stringOrUndefined(parsed.especialidad),
    distrito: stringOrUndefined(parsed.distrito),
  };
}
