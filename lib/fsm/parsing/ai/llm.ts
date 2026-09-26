export type LlmProvider = "gemini";

type JsonScalarType = "string" | "number" | "boolean";

export type JsonSchema =
  | { type: "object"; properties: Record<string, JsonSchema>; required?: string[] }
  | { type: "array"; items: JsonSchema }
  | { type: JsonScalarType | [JsonScalarType, "null"]; enum?: string[] };

export type LlmJsonRequest = {
  operation: string;
  systemPrompt: string;
  userText: string;
  schema: JsonSchema;
};

export type LlmJsonOutcome =
  | { ok: true; json: unknown }
  | { ok: false; failure: "request_failed"; errorName: string }
  | { ok: false; failure: "http_error"; status: number; model: string }
  | { ok: false; failure: "no_text" }
  | { ok: false; failure: "invalid_json" };

/** Puerto de IA: cada proveedor (Gemini, Claude, OpenAI) implementa generateJson; las tareas no conocen al proveedor. */
export interface LlmClient {
  readonly provider: LlmProvider;
  generateJson(request: LlmJsonRequest): Promise<LlmJsonOutcome>;
}
