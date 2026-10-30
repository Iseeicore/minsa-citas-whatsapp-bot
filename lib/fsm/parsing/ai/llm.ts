import type { LlmFailure } from "@/lib/enums/llm-failure";
import type { LlmClientStatus } from "@/lib/enums/llm-client-status";

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
  | { ok: false; failure: LlmFailure.REQUEST_FAILED; errorName: string }
  | { ok: false; failure: LlmFailure.HTTP_ERROR; status: number; model: string }
  | { ok: false; failure: LlmFailure.NO_TEXT }
  | { ok: false; failure: LlmFailure.INVALID_JSON };

export interface LlmClient {
  readonly provider: LlmProvider;
  generateJson(request: LlmJsonRequest): Promise<LlmJsonOutcome>;
}

export type LlmClientLookup =
  | { status: LlmClientStatus.AVAILABLE; client: LlmClient }
  | { status: LlmClientStatus.DISABLED }
  | { status: LlmClientStatus.MISCONFIGURED; provider: string };
