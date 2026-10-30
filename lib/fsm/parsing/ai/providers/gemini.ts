import { timedFetch } from "@/lib/observability/http";
import type { JsonSchema, LlmClient, LlmJsonOutcome } from "@/lib/fsm/parsing/ai/llm";
import { LlmFailure } from "@/lib/enums/llm-failure";
import { isString } from "@/lib/utils/type-guards";
import { REQUEST_TIMEOUT_MS } from "@/lib/constants/limits/ai";
import { findGoogleClientApi } from "@/lib/config/integrations";

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
      headers: { "Content-Type": "application/json", "x-goog-api-key": findGoogleClientApi() ?? "" },
      body,
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    });
  } catch (error) {
    return { ok: false, failure: LlmFailure.REQUEST_FAILED, errorName: error instanceof Error ? error.name : "unknown" };
  }

  if (!response.ok) {
    return { ok: false, failure: LlmFailure.HTTP_ERROR, status: response.status, model };
  }

  try {
    const envelope = (await response.json()) as GeminiGenerateContentBody;
    const text = envelope.candidates?.[0]?.content?.parts?.[0]?.text;
    if (!isString(text)) return { ok: false, failure: LlmFailure.NO_TEXT };
    return { ok: true, json: JSON.parse(text) as unknown };
  } catch {
    return { ok: false, failure: LlmFailure.INVALID_JSON };
  }
}

export function toGeminiSchema(schema: JsonSchema): Record<string, unknown> {
  if (schema.type === "object") {
    const properties = Object.fromEntries(Object.entries(schema.properties).map(([name, property]) => [name, toGeminiSchema(property)]));
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
