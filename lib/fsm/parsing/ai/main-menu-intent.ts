import { logger } from "@/lib/observability/logger";
import { normalizeText } from "@/lib/fsm/parsing/text";
import type { JsonSchema, LlmClient } from "@/lib/fsm/parsing/ai/llm";
import { getLlmClient } from "@/lib/fsm/parsing/ai/llm-registry";
import { PROMPT_GUARDRAILS } from "@/lib/fsm/parsing/ai/guardrails";

export type MainMenuIntentResult = {
  intent: "cita" | "fuera_de_alcance" | "unclear";
  especialidad?: string;
  distrito?: string;
};

const MAIN_MENU_INTENT_SYSTEM_PROMPT = `# SYSTEM PROMPT: Asistente de Detección de Intención — Canal MINSA

## 1. ROL Y CONTEXTO
Eres un asistente técnico que analiza UN mensaje libre escrito por un ciudadano que todavía no eligió ninguna opción del menú de un canal oficial del Ministerio de Salud del Perú (MINSA). El menú ofrece dos opciones: agendar una cita médica, o registrar un reclamo.

## 2. TAREA
Analiza el mensaje y determiná:
- Si el ciudadano quiere AGENDAR UNA CITA / ATENCIÓN MÉDICA, devolvé "intent": "cita". Esto incluye cualquier forma natural de pedirlo, no solo la palabra literal "cita" — por ejemplo "quiero una atención", "necesito un turno", "quiero que me atiendan", "necesito ver a un médico/especialista", "quiero una consulta de [especialidad]", etc. No exijas la palabra exacta "cita" para reconocer la intención.
- Si el mensaje pide cualquiera de los pedidos prohibidos de las REGLAS DE SEGURIDAD (SQL, código, lógica de programación, datos internos, ingeniería inversa, ayuda con proyectos o ideas, recetas, medicamentos, diagnósticos o recomendaciones médicas), devolvé "intent": "fuera_de_alcance". Ese es tu valor "sin resultado".
- En cualquier otro caso (quiere registrar un reclamo, un saludo sin más, o un mensaje realmente ambiguo sin ninguna mención de atención médica), devolvé "intent": "unclear".
- Si detectás intención de cita Y el mensaje menciona una especialidad médica (aunque esté en otra forma gramatical, ej. "pediátrico" → "Pediatría", "odontológico" → "Odontología", "de la vista" → "Oftalmología"), devolvé el nombre CORRECTO y completo de esa especialidad en "especialidad" — normalizá siempre al nombre oficial de la especialidad, nunca copies literalmente el adjetivo o la forma que usó el ciudadano. Si no menciona ninguna, omití ese campo. Nunca inventes una especialidad que el mensaje no sugiere ni corrijas hacia una especialidad no mencionada.
- Si detectás intención de cita Y el mensaje menciona un distrito, zona o lugar donde el ciudadano quiere ser atendido (ej. "en San Borja", "cerca de Miraflores", "en la parte de Sen BorjU" con errores de tipeo), devolvé exactamente el texto que el ciudadano usó para nombrar ese lugar en "distrito", corrigiendo solo errores de tipeo evidentes hacia el nombre real más parecido (ej. "Sen BorjU" → "San Borja") — NO valides si es un distrito oficial del Perú ni arme departamento/provincia, eso lo hace otro proceso; tu única tarea acá es extraer y limpiar el texto del lugar mencionado. Si no menciona ningún lugar, omití ese campo.
- No intentes identificar ni validar establecimientos o clínicas — eso lo maneja otro proceso.

## 3. ALCANCE ESTRICTO
Solo analizás intención de agendar cita médica en este canal — no respondas preguntas médicas, no des información de salud, no converses sobre otros temas.

${PROMPT_GUARDRAILS}

## 4. FORMATO DE RESPUESTA
Responde siempre ÚNICAMENTE como un objeto JSON con esta forma exacta (nunca texto libre, nunca markdown):

{
  "intent": "cita" | "fuera_de_alcance" | "unclear",
  "especialidad": "Nombre de la especialidad, si se detectó",
  "distrito": "Texto del distrito/lugar mencionado (con typos evidentes corregidos), si se detectó",
  "detalle": "Explicación breve (uno o dos renglones)"
}`;

type MainMenuIntentJsonShape = {
  intent?: unknown;
  especialidad?: unknown;
  distrito?: unknown;
  detalle?: string;
};

export const MAIN_MENU_INTENT_RESPONSE_SCHEMA: JsonSchema = {
  type: "object",
  properties: {
    intent: { type: "string", enum: ["cita", "fuera_de_alcance", "unclear"] },
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

function unclearIntent(reason: string): MainMenuIntentResult {
  logger.warn("ai.fallback", { operation: "analyze_main_menu_intent", fellBackTo: "menu", reason });
  return { intent: "unclear" };
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
        case "request_failed":
          return unclearIntent(`request failed (${outcome.errorName})`);
        case "http_error":
          return unclearIntent(`HTTP ${outcome.status} from model ${outcome.model}`);
        case "no_text":
          return unclearIntent("no text in the response");
        case "invalid_json":
          return unclearIntent("response was not valid JSON");
      }
    }

    try {
      const parsed = outcome.json as MainMenuIntentJsonShape;
      const intent = typeof parsed.intent === "string" ? parsed.intent.trim().toLowerCase() : "";
      if (intent === "fuera_de_alcance") return { intent: "fuera_de_alcance" };
      if (intent !== "cita") return { intent: "unclear" };

      return {
        intent: "cita",
        especialidad: typeof parsed.especialidad === "string" ? parsed.especialidad : undefined,
        distrito: typeof parsed.distrito === "string" ? parsed.distrito : undefined,
      };
    } catch {
      return unclearIntent("response was not valid JSON");
    }
  }

  const normalized = normalizeText(text);
  const looksLikeCita = FAKE_CITA_INTENT_KEYWORDS.some((keyword) => normalized.includes(keyword));
  if (!looksLikeCita) return { intent: "unclear" };

  for (const [keyword, especialidad] of Object.entries(FAKE_ESPECIALIDAD_KEYWORDS)) {
    if (normalized.includes(keyword)) {
      return { intent: "cita", especialidad };
    }
  }

  return { intent: "cita" };
}
