import type { JsonSchema, LlmClient } from "@/lib/fsm/parsing/ai/llm";
import { getLlmClient } from "@/lib/fsm/parsing/ai/llm-registry";
import { PROMPT_GUARDRAILS } from "@/lib/fsm/parsing/ai/guardrails";

export type SelectionHintsResult = {
  especialidad?: string;
  establecimiento?: string;
};

const SELECTION_HINTS_SYSTEM_PROMPT = `# SYSTEM PROMPT: Extractor de pistas — Canal MINSA

## 1. TAREA
Recibirás un mensaje de un ciudadano que está agendando una cita médica. Extrae, si aparecen en el texto:
- "especialidad": la especialidad médica que menciona, normalizada a su nombre oficial en singular y sin abreviaturas (ej. "muelas" => "Odontología"; "pediátrico" => "Pediatría"; "para mi corazón" => "Cardiología").
- "establecimiento": el nombre del establecimiento de salud (hospital, centro de salud, posta, clínica) tal como lo escribió, sin corregir ni completar.
No valides ni inventes: si un dato no está claramente en el texto, devuélvelo como null.

## 2. ALCANCE
Solo extraes esos dos datos. Tu valor "sin resultado" es ambos como null.

${PROMPT_GUARDRAILS}

## 3. FORMATO DE RESPUESTA
Responde SIEMPRE únicamente con un objeto JSON, sin markdown ni texto adicional:
{ "especialidad": "<texto o null>", "establecimiento": "<texto o null>", "detalle": "Explicación breve." }`;

export const SELECTION_HINTS_RESPONSE_SCHEMA: JsonSchema = {
  type: "object",
  properties: {
    especialidad: { type: ["string", "null"] },
    establecimiento: { type: ["string", "null"] },
    detalle: { type: "string" },
  },
  required: ["detalle"],
};

export async function extractSelectionHints(
  _step: string,
  text: string,
  llm: LlmClient | null = getLlmClient(),
): Promise<SelectionHintsResult> {
  if (!text.trim()) return {};

  if (llm) {
    const outcome = await llm.generateJson({
      operation: "extract_selection_hints",
      systemPrompt: SELECTION_HINTS_SYSTEM_PROMPT,
      userText: text,
      schema: SELECTION_HINTS_RESPONSE_SCHEMA,
    });
    if (!outcome.ok) return {};

    try {
      const parsed = outcome.json as { especialidad?: unknown; establecimiento?: unknown };
      return {
        especialidad: typeof parsed.especialidad === "string" ? parsed.especialidad : undefined,
        establecimiento: typeof parsed.establecimiento === "string" ? parsed.establecimiento : undefined,
      };
    } catch {
      return {};
    }
  }

  return {};
}
