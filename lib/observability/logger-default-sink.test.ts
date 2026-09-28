import { afterEach, describe, expect, it, vi } from "vitest";

async function loadLoggerWith(env: Record<string, string | undefined>) {
  vi.resetModules();
  for (const [name, value] of Object.entries(env)) vi.stubEnv(name, value as string);
  const createDailyFileSink = vi.fn(() => () => {});
  vi.doMock("@/lib/observability/file-sink", () => ({ createDailyFileSink }));
  await import("@/lib/observability/logger");
  return createDailyFileSink;
}

describe("the app logger's file sink", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.doUnmock("@/lib/observability/file-sink");
  });

  it("writes to logs/ when LOG_DIR is left empty, as a copied .env.example leaves it", async () => {
    const createDailyFileSink = await loadLoggerWith({ LOG_TO_FILE: "true", LOG_DIR: "", VERCEL: "" });
    expect(createDailyFileSink).toHaveBeenCalledWith({ dir: "logs" });
  });

  it("uses LOG_DIR when it is set", async () => {
    const createDailyFileSink = await loadLoggerWith({ LOG_TO_FILE: "true", LOG_DIR: "custom-logs", VERCEL: "" });
    expect(createDailyFileSink).toHaveBeenCalledWith({ dir: "custom-logs" });
  });

  it("writes no file unless LOG_TO_FILE is exactly true", async () => {
    const createDailyFileSink = await loadLoggerWith({ LOG_TO_FILE: "", LOG_DIR: "" });
    expect(createDailyFileSink).not.toHaveBeenCalled();
  });
});
