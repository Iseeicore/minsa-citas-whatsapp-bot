import { timedFetch } from "@/lib/observability/http";
import type { JsonSchema, LlmClient, LlmJsonOutcome } from "@/lib/fsm/parsing/ai/llm";

export const REQUEST_TIMEOUT_MS = 15_000;

const DEFAULT_MODEL = "gemini-3.6-flash";

export type GeminiGenerateContentBody = {
  candidates?: Array<{
    content?: { parts?: Array<{ text?: string }> };
  }>;
};

export type GeminiJsonRequest = {
  operation: string;
  systemPrompt: string;
  userText: string;
  responseSchema: object;
};

export type GeminiJsonOutcome = LlmJsonOutcome;

/** La API key viaja en la cabecera x-goog-api-key, nunca en la URL, para que no llegue a mensajes de error ni logs. */
export async function requestGeminiJson(request: GeminiJsonRequest): Promise<GeminiJsonOutcome> {
  const model = process.env.GOOGLE_AI_MODEL || DEFAULT_MODEL;
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`;

  const body = JSON.stringify({
    system_instruction: { parts: [{ text: request.systemPrompt }] },
    contents: [{ role: "user", parts: [{ text: request.userText }] }],
    generationConfig: {
      responseMimeType: "application/json",
      responseSchema: request.responseSchema,
    },
  });

  let response: Response;
  try {
    response = await timedFetch("gemini", request.operation, url, {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-goog-api-key": process.env.GOOGLE_CLIENT_API ?? "" },
      body,
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    });
  } catch (error) {
    return { ok: false, failure: "request_failed", errorName: error instanceof Error ? error.name : "unknown" };
  }

  if (!response.ok) {
    return { ok: false, failure: "http_error", status: response.status, model };
  }

  try {
    const envelope = (await response.json()) as GeminiGenerateContentBody;
    const text = envelope.candidates?.[0]?.content?.parts?.[0]?.text;
    if (typeof text !== "string") return { ok: false, failure: "no_text" };
    return { ok: true, json: JSON.parse(text) as unknown };
  } catch {
    return { ok: false, failure: "invalid_json" };
  }
}

export function toGeminiSchema(schema: JsonSchema): Record<string, unknown> {
  if (schema.type === "object") {
    const properties = Object.fromEntries(
      Object.entries(schema.properties).map(([name, property]) => [name, toGeminiSchema(property)]),
    );
    return schema.required ? { type: "OBJECT", properties, required: schema.required } : { type: "OBJECT", properties };
  }
  if (schema.type === "array") return { type: "ARRAY", items: toGeminiSchema(schema.items) };

  const nullable = Array.isArray(schema.type);
  const scalar = Array.isArray(schema.type) ? schema.type[0] : schema.type;
  return {
    type: scalar.toUpperCase(),
    ...(nullable ? { nullable: true } : {}),
    ...(schema.enum ? { enum: schema.enum } : {}),
  };
}

export function createGeminiClient(): LlmClient {
  return {
    provider: "gemini",
    generateJson: (request) =>
      requestGeminiJson({
        operation: request.operation,
        systemPrompt: request.systemPrompt,
        userText: request.userText,
        responseSchema: toGeminiSchema(request.schema),
      }),
  };
}
