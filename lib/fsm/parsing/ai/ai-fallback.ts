import { logger } from "@/lib/observability/logger";
import type { LlmJsonOutcome } from "@/lib/fsm/parsing/ai/llm";
import { LlmFailure } from "@/lib/enums/llm-failure";

type FailedLlmOutcome = Exclude<LlmJsonOutcome, { ok: true }>;

export function describeLlmFailure(outcome: FailedLlmOutcome): string {
  switch (outcome.failure) {
    case LlmFailure.REQUEST_FAILED:
      return `request failed (${outcome.errorName})`;
    case LlmFailure.HTTP_ERROR:
      return `HTTP ${outcome.status} from model ${outcome.model}`;
    case LlmFailure.NO_TEXT:
      return "no text in the response";
    case LlmFailure.INVALID_JSON:
      return "response was not valid JSON";
  }
}

export function misconfiguredProviderReason(provider: string): string {
  return `provider ${provider} is not registered`;
}

export const ANSWER_NOT_OBJECT_REASON = "response was not a JSON object";

export function logAiFallback(operation: string, fellBackTo: string, reason: string): void {
  logger.warn("ai.fallback", { operation, fellBackTo, reason });
}
