import { logger } from "@/lib/observability/logger";
import type { LlmClient, LlmClientLookup, LlmProvider } from "@/lib/fsm/parsing/ai/llm";
import { createGeminiClient } from "@/lib/fsm/parsing/ai/providers/gemini";
import { createFakeLlmClient } from "@/lib/fsm/parsing/ai/providers/fake";
import { LlmClientStatus } from "@/lib/enums/llm-client-status";

const DEFAULT_PROVIDER: LlmProvider = "gemini";

const PROVIDERS = new Map<string, () => LlmClient>([["gemini", createGeminiClient]]);

const warnedUnknownProviders = new Set<string>();

function requestedProvider(): string {
  return process.env.AI_PROVIDER || DEFAULT_PROVIDER;
}

export function isRegisteredLlmProvider(name: string): boolean {
  return PROVIDERS.has(name);
}

export function configuredLlmProvider(): LlmProvider {
  const requested = requestedProvider();
  return PROVIDERS.has(requested) ? (requested as LlmProvider) : DEFAULT_PROVIDER;
}

export function lookupLlmClient(): LlmClientLookup {
  if (process.env.SANDBOX_USE_REAL_AI !== "true") return { status: LlmClientStatus.AVAILABLE, client: createFakeLlmClient() };

  const requested = requestedProvider();
  const create = PROVIDERS.get(requested);
  if (create) return { status: LlmClientStatus.AVAILABLE, client: create() };

  if (!warnedUnknownProviders.has(requested)) {
    warnedUnknownProviders.add(requested);
    logger.warn("ai.provider_unknown", { provider: requested });
  }
  return { status: LlmClientStatus.MISCONFIGURED, provider: requested };
}
