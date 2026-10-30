import type { LlmClient, LlmClientLookup } from "@/lib/fsm/parsing/ai/llm";
import { LlmClientStatus } from "@/lib/enums/llm-client-status";

export const llmAvailable = (client: LlmClient): LlmClientLookup => ({ status: LlmClientStatus.AVAILABLE, client });

export const LLM_DISABLED: LlmClientLookup = { status: LlmClientStatus.DISABLED };

export const LLM_MISCONFIGURED: LlmClientLookup = { status: LlmClientStatus.MISCONFIGURED, provider: "unknown-llm" };
