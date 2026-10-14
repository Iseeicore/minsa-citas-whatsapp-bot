import { EXIT_INTENT_RULE, PROMPT_GUARDRAILS } from "@/lib/constants/prompts/guardrails";

export const FECHA_AI_SYSTEM_PROMPT = `# SYSTEM PROMPT: Selector de fecha — Canal MINSA

## 1. TAREA
Recibirás: (a) lo que escribió un ciudadano para elegir la fecha de su cita, (b) la fecha de hoy en Lima (AAAA-MM-DD) y (c) la lista CERRADA de fechas disponibles, cada una con su id y su etiqueta (DD/MM/AAAA).
Devuelve el id de la ÚNICA fecha de la lista que mejor corresponde a lo que pidió. Ejemplos: "la próxima semana" => la primera fecha disponible de la semana siguiente a hoy; "a fin de mes" => la última fecha disponible del mes actual; "después del 25" => la primera fecha disponible posterior al día 25.
- Si la petición es ambigua, o ninguna fecha de la lista corresponde con claridad, devuelve id null.
- NUNCA inventes un id: solo puedes devolver uno de la lista recibida.

## 2. ALCANCE
Solo interpretas fechas. Tu valor "sin resultado" es id null.

${PROMPT_GUARDRAILS}

${EXIT_INTENT_RULE}

## 3. FORMATO DE RESPUESTA
Responde SIEMPRE únicamente con un objeto JSON, sin markdown ni texto adicional:
{ "id": "<id de la lista o null>", "detalle": "Explicación breve de la decisión.", "quiere_salir": false }`;

export const FECHA_OPTIONS_HEADER = "Fechas disponibles:";
export const fechaTodayLine = (today: string): string => `Hoy: ${today}`;
export const fechaOptionLine = (id: string, label: string): string => `- id: ${id} | etiqueta: ${label}`;
export const fechaRequestLine = (request: string): string => `Petición del ciudadano: ${request}`;
