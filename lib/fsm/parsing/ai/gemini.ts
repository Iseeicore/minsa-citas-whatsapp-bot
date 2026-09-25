import { timedFetch } from "@/lib/observability/http";

// Shared by every Gemini call in this folder: one request shape, one timeout and
// one way of reading the model's JSON answer. Each AI task keeps its own prompt,
// schema, interpretation of the answer and fail-open value; this only reports
// HOW a call failed so each task can map that to its own fallback.

export const REQUEST_TIMEOUT_MS = 15_000;

const DEFAULT_MODEL = "gemini-3.6-flash";

export type GeminiGenerateContentBody = {
  candidates?: Array<{
    content?: { parts?: Array<{ text?: string }> };
  }>;
};

export type GeminiJsonRequest = {
  // timedFetch's operation name, as it appears in the external.http log line.
  operation: string;
  systemPrompt: string;
  userText: string;
  responseSchema: object;
};

export type GeminiJsonOutcome =
  | { ok: true; json: unknown }
  | { ok: false; failure: "request_failed"; errorName: string }
  | { ok: false; failure: "http_error"; status: number; model: string }
  | { ok: false; failure: "no_text" }
  | { ok: false; failure: "invalid_json" };

export async function requestGeminiJson(request: GeminiJsonRequest): Promise<GeminiJsonOutcome> {
  const model = process.env.GOOGLE_AI_MODEL || DEFAULT_MODEL;
  // The key goes in a header, never in the URL: a URL ends up in error messages,
  // traces and log lines, a header does not.
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

  // A body that is not JSON, or JSON without the envelope's shape (e.g. null),
  // both count as an unreadable answer.
  try {
    const envelope = (await response.json()) as GeminiGenerateContentBody;
    const text = envelope.candidates?.[0]?.content?.parts?.[0]?.text;
    if (typeof text !== "string") return { ok: false, failure: "no_text" };
    return { ok: true, json: JSON.parse(text) as unknown };
  } catch {
    return { ok: false, failure: "invalid_json" };
  }
}
