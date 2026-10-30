import type { JsonSchema, LlmClient, LlmJsonOutcome, LlmJsonRequest } from "@/lib/fsm/parsing/ai/llm";
import { normalizeText } from "@/lib/fsm/parsing/text/text";
import { distritoDirectAnswerLine, distritoInitialMessageLine } from "@/lib/constants/prompts/distrito";
import { OMITIR_KEYWORD } from "@/lib/constants/textos/incidencia";
import { MainMenuIntent } from "@/lib/enums/main-menu-intent";
import { QueryKind } from "@/lib/enums/query-kind";

type FakeDistritoCandidate = { departamento: string; provincia: string; distrito: string };

type FakeAnswer = (request: LlmJsonRequest) => Record<string, unknown>;

const FAKE_OMITIR_KEYWORDS = [OMITIR_KEYWORD, "NO QUIERO", "NO DESEO", "NO TENGO", "PREFIERO NO", "PASO", "SIN FOTO", "NO HACE FALTA"];

const FAKE_ESPECIALIDAD_KEYWORDS: Record<string, string> = {
  ODONTOLOG: "Odontología",
  "MEDICINA GENERAL": "Medicina General",
  PEDIATR: "Pediatría",
  GINECOLOG: "Ginecología",
};

const FAKE_CITA_INTENT_KEYWORDS = ["CITA", "ATENCION", "CONSULTA", "TURNO", "MEDICO", "ATIENDAN"];
const FAKE_INCIDENCIA_STEMS = ["INCIDENCI", "RECLAM", "QUEJ", "DENUNCI", "CORRUP", "COIMA", "SOBORN"];
const FAKE_REFERENCIA_STEMS = ["REFERENCI", "DERIVACI"];
const FAKE_CITA_WORD = "CITA";

const FAKE_DISTRITO_CANDIDATES: Record<string, FakeDistritoCandidate[]> = {
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

const FAKE_PROVIDER = "fake";

function offersIntent(schema: JsonSchema, intent: MainMenuIntent): boolean {
  if (schema.type !== "object") return false;
  const intentSchema = schema.properties.intent;
  return intentSchema !== undefined && "enum" in intentSchema && (intentSchema.enum ?? []).includes(intent);
}

function answerMainMenuIntent(request: LlmJsonRequest): Record<string, unknown> {
  const normalized = normalizeText(request.userText);
  const incidencias = offersIntent(request.schema, MainMenuIntent.INCIDENCIA);
  if (incidencias && FAKE_INCIDENCIA_STEMS.some((stem) => normalized.includes(stem)))
    return { intent: MainMenuIntent.INCIDENCIA, detalle: "" };
  if (FAKE_REFERENCIA_STEMS.some((stem) => normalized.includes(stem)) && !normalized.includes(FAKE_CITA_WORD)) {
    return { intent: MainMenuIntent.REFERENCIA, detalle: "" };
  }
  if (!FAKE_CITA_INTENT_KEYWORDS.some((keyword) => normalized.includes(keyword))) return { intent: MainMenuIntent.UNCLEAR, detalle: "" };

  const especialidad = Object.entries(FAKE_ESPECIALIDAD_KEYWORDS).find(([keyword]) => normalized.includes(keyword))?.[1];
  return especialidad === undefined
    ? { intent: MainMenuIntent.CITA, detalle: "" }
    : { intent: MainMenuIntent.CITA, especialidad, detalle: "" };
}

function splitDistritoRequest(userText: string): { distritoText: string; contextText: string | undefined } {
  const answer = userText.slice(distritoDirectAnswerLine("").length);
  const contextMarker = `\n${distritoInitialMessageLine("")}`;
  const at = answer.indexOf(contextMarker);
  if (at === -1) return { distritoText: answer, contextText: undefined };
  return { distritoText: answer.slice(0, at), contextText: answer.slice(at + contextMarker.length) };
}

function findFakeDistritoCandidates(distritoText: string, contextText: string | undefined): FakeDistritoCandidate[] {
  const direct = FAKE_DISTRITO_CANDIDATES[distritoText.trim().toLowerCase()];
  if (direct) return direct;

  const haystack = `${distritoText} ${contextText ?? ""}`.toLowerCase();
  return Object.entries(FAKE_DISTRITO_CANDIDATES).find(([knownDistrito]) => haystack.includes(knownDistrito))?.[1] ?? [];
}

function answerDistrito(request: LlmJsonRequest): Record<string, unknown> {
  const { distritoText, contextText } = splitDistritoRequest(request.userText);
  return { candidates: findFakeDistritoCandidates(distritoText, contextText), detalle: "", quiere_salir: false };
}

function answerFotoIntent(request: LlmJsonRequest): Record<string, unknown> {
  const normalized = normalizeText(request.userText);
  return { quiere_omitir: FAKE_OMITIR_KEYWORDS.some((keyword) => normalized.includes(normalizeText(keyword))), detalle: "" };
}

const FAKE_ANSWERS: Record<string, FakeAnswer> = {
  [QueryKind.ANALYZE_MAIN_MENU_INTENT]: answerMainMenuIntent,
  [QueryKind.RESOLVE_DISTRITO_AI]: answerDistrito,
  [QueryKind.RESOLVE_FECHA_AI]: () => ({ id: null, detalle: "", quiere_salir: false }),
  [QueryKind.EXTRACT_SELECTION_HINTS]: () => ({ especialidad: null, establecimiento: null, detalle: "", quiere_salir: false }),
  [QueryKind.ANALYZE_INCIDENCIA_FOTO_INTENT]: answerFotoIntent,
};

export function createFakeLlmClient(): LlmClient {
  return {
    provider: FAKE_PROVIDER,
    async generateJson(request: LlmJsonRequest): Promise<LlmJsonOutcome> {
      const answer = Object.hasOwn(FAKE_ANSWERS, request.operation) ? FAKE_ANSWERS[request.operation] : undefined;
      return { ok: true, json: answer ? answer(request) : {} };
    },
  };
}
