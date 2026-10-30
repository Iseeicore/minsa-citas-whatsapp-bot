import type { LlmClient, LlmClientLookup } from "@/lib/fsm/parsing/ai/llm";
import { LlmClientStatus } from "@/lib/enums/llm-client-status";
import { createFakeLlmClient } from "@/lib/fsm/parsing/ai/providers/fake";

export const llmAvailable = (client: LlmClient): LlmClientLookup => ({ status: LlmClientStatus.AVAILABLE, client });

export const LLM_FAKE: LlmClientLookup = { status: LlmClientStatus.AVAILABLE, client: createFakeLlmClient() };

export const LLM_MISCONFIGURED: LlmClientLookup = { status: LlmClientStatus.MISCONFIGURED, provider: "unknown-llm" };
