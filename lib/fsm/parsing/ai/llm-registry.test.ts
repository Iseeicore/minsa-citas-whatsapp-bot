import { afterEach, describe, expect, it, vi } from "vitest";
import { configuredLlmProvider, getLlmClient } from "@/lib/fsm/parsing/ai/llm-registry";
import { logger } from "@/lib/observability/logger";

describe("getLlmClient", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.restoreAllMocks();
  });

  it("returns no client while the real AI is switched off, so every task uses its fixed fallback", () => {
    vi.stubEnv("SANDBOX_USE_REAL_AI", "false");
    expect(getLlmClient()).toBeNull();
  });

  it("defaults to Gemini when AI_PROVIDER is unset or empty", () => {
    vi.stubEnv("SANDBOX_USE_REAL_AI", "true");
    vi.stubEnv("AI_PROVIDER", "");
    expect(getLlmClient()?.provider).toBe("gemini");
  });

  it("returns the Gemini client when AI_PROVIDER=gemini", () => {
    vi.stubEnv("SANDBOX_USE_REAL_AI", "true");
    vi.stubEnv("AI_PROVIDER", "gemini");
    expect(getLlmClient()?.provider).toBe("gemini");
  });

  it("falls back to no client for an unknown provider and warns only once", () => {
    const warn = vi.spyOn(logger, "warn");
    vi.stubEnv("SANDBOX_USE_REAL_AI", "true");
    vi.stubEnv("AI_PROVIDER", "unknown-llm");

    expect(getLlmClient()).toBeNull();
    expect(getLlmClient()).toBeNull();

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
