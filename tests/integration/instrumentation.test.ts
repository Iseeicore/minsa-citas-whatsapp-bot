import { afterEach, describe, expect, it, vi } from "vitest";
import { configureLogger } from "@/lib/observability/logger";
import { register } from "@/instrumentation";

describe("instrumentation register()", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("checks the configuration once at server start on the Node.js runtime", async () => {
    const lines: Array<Record<string, unknown>> = [];
    const restore = configureLogger({ sink: (_level, line) => lines.push(JSON.parse(line)), level: "info" });
    vi.stubEnv("NEXT_RUNTIME", "nodejs");
    vi.stubEnv("AI_PROVIDER", "gemnini");

    await register();
    restore();

    expect(lines.filter((line) => line.event === "config.invalid")).toEqual([
      expect.objectContaining({ level: "error", issue: "AI_PROVIDER_UNKNOWN" }),
    ]);
  });

  it("does nothing on the Edge runtime", async () => {
    const lines: string[] = [];
    const restore = configureLogger({ sink: (_level, line) => lines.push(line), level: "info" });
    vi.stubEnv("NEXT_RUNTIME", "edge");
    vi.stubEnv("AI_PROVIDER", "gemnini");

    await register();
    restore();

    expect(lines).toEqual([]);
  });
});
