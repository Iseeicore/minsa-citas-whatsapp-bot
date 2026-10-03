import { normalizeText } from "@/lib/fsm/parsing/text/text";
import type { JsonSchema, LlmClient } from "@/lib/fsm/parsing/ai/llm";
import { getLlmClient } from "@/lib/fsm/parsing/ai/llm-registry";
import { PROMPT_GUARDRAILS } from "@/lib/fsm/parsing/ai/guardrails";

export type FotoIntentResult = { quiereOmitir: boolean };

const RECLAMO_FOTO_INTENT_SYSTEM_PROMPT = `# SYSTEM PROMPT: Detección de intención — foto del reclamo (Canal MINSA)

## 1. TAREA
Un ciudadano está registrando un reclamo y le pedimos una foto como evidencia (opcional). Recibirás el mensaje de texto que escribió en respuesta, en vez de enviar una foto. Determiná si ese mensaje expresa que NO quiere o NO puede enviar la foto y prefiere continuar sin ella (ej. "no quiero", "no tengo foto", "prefiero no", "paso de la foto", "no hace falta", "mejor no"). Devolvé "quiere_omitir": true en ese caso.

En cualquier otro caso — incluido si dice que SÍ va a mandarla, si hace una pregunta, si manda un texto ambiguo, irrelevante o que no tiene relación con la foto — devolvé "quiere_omitir": false. Ese es tu valor "sin resultado": ante la duda, asumí que todavía puede estar por mandar la foto.

## 2. ALCANCE
Solo determinás esa intención. No interpretes ni comentes el contenido del reclamo.

${PROMPT_GUARDRAILS}

## 3. FORMATO DE RESPUESTA
Responde siempre ÚNICAMENTE como un objeto JSON con esta forma exacta (nunca texto libre, nunca markdown):
{ "quiere_omitir": true | false, "detalle": "Explicación breve (uno o dos renglones)" }`;

export const RECLAMO_FOTO_INTENT_RESPONSE_SCHEMA: JsonSchema = {
  type: "object",
  properties: {
    quiere_omitir: { type: "boolean" },
    detalle: { type: "string" },
  },
  required: ["quiere_omitir", "detalle"],
};

const FAKE_OMITIR_KEYWORDS = ["OMITIR", "NO QUIERO", "NO DESEO", "NO TENGO", "PREFIERO NO", "PASO", "SIN FOTO", "NO HACE FALTA"];

export async function analyzeFotoIntent(
  text: string,
  llm: LlmClient | null = getLlmClient(),
): Promise<FotoIntentResult> {
  if (llm) {
    const outcome = await llm.generateJson({
      operation: "analyze_reclamo_foto_intent",
      systemPrompt: RECLAMO_FOTO_INTENT_SYSTEM_PROMPT,
      userText: text,
      schema: RECLAMO_FOTO_INTENT_RESPONSE_SCHEMA,
    });
    if (!outcome.ok) return { quiereOmitir: false };

    try {
      const parsed = outcome.json as { quiere_omitir?: unknown };
      return { quiereOmitir: parsed.quiere_omitir === true };
    } catch {
      return { quiereOmitir: false };
    }
  }

  const normalized = normalizeText(text);
  return { quiereOmitir: FAKE_OMITIR_KEYWORDS.some((keyword) => normalized.includes(normalizeText(keyword))) };
}
