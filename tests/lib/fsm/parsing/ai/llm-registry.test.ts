import { afterEach, describe, expect, it, vi } from "vitest";
import { configuredLlmProvider, lookupLlmClient } from "@/lib/fsm/parsing/ai/llm-registry";
import { LlmClientStatus } from "@/lib/enums/llm-client-status";
import { logger } from "@/lib/observability/logger";

describe("lookupLlmClient", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.restoreAllMocks();
  });

  it("reports the real AI as disabled while it is switched off, so every task uses its fixed fallback", () => {
    vi.stubEnv("SANDBOX_USE_REAL_AI", "false");
    expect(lookupLlmClient()).toEqual({ status: LlmClientStatus.DISABLED });
  });

  it("defaults to Gemini when AI_PROVIDER is unset or empty", () => {
    vi.stubEnv("SANDBOX_USE_REAL_AI", "true");
    vi.stubEnv("AI_PROVIDER", "");
    const lookup = lookupLlmClient();
    expect(lookup.status).toBe(LlmClientStatus.AVAILABLE);
    expect(lookup.status === LlmClientStatus.AVAILABLE && lookup.client.provider).toBe("gemini");
  });

  it("returns the Gemini client when AI_PROVIDER=gemini", () => {
    vi.stubEnv("SANDBOX_USE_REAL_AI", "true");
    vi.stubEnv("AI_PROVIDER", "gemini");
    const lookup = lookupLlmClient();
    expect(lookup.status === LlmClientStatus.AVAILABLE && lookup.client.provider).toBe("gemini");
  });

  it("reports an unknown provider as misconfigured, not as a disabled AI, and warns only once", () => {
    const warn = vi.spyOn(logger, "warn");
    vi.stubEnv("SANDBOX_USE_REAL_AI", "true");
    vi.stubEnv("AI_PROVIDER", "unknown-llm");

    expect(lookupLlmClient()).toEqual({ status: LlmClientStatus.MISCONFIGURED, provider: "unknown-llm" });
    expect(lookupLlmClient()).toEqual({ status: LlmClientStatus.MISCONFIGURED, provider: "unknown-llm" });

    const unknown = warn.mock.calls.filter(([event]) => event === "ai.provider_unknown");
    expect(unknown).toHaveLength(1);
    expect(unknown[0][1]).toEqual({ provider: "unknown-llm" });
  });
});

describe("configuredLlmProvider", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("names the provider used to label AI calls in the logs", () => {
    vi.stubEnv("AI_PROVIDER", "");
    expect(configuredLlmProvider()).toBe("gemini");
  });
});
