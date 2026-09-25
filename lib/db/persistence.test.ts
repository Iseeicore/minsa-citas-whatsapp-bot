import { afterEach, describe, expect, it, vi } from "vitest";
import { isDatabaseEnabled, persistenceDisabledResponse } from "@/lib/db/persistence";

describe("isDatabaseEnabled", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("is on when DATABASE_ENABLED is not set (today's behavior)", () => {
    vi.stubEnv("DATABASE_ENABLED", undefined as unknown as string);
    delete process.env.DATABASE_ENABLED;
    expect(isDatabaseEnabled()).toBe(true);
  });

  it('is off only for the exact value "false"', () => {
    vi.stubEnv("DATABASE_ENABLED", "false");
    expect(isDatabaseEnabled()).toBe(false);

    for (const value of ["true", "", "0", "FALSE", "no"]) {
      vi.stubEnv("DATABASE_ENABLED", value);
      expect(isDatabaseEnabled()).toBe(true);
    }
  });

  it("is read on every call, not frozen at import time", () => {
    vi.stubEnv("DATABASE_ENABLED", "true");
    expect(isDatabaseEnabled()).toBe(true);
    vi.stubEnv("DATABASE_ENABLED", "false");
    expect(isDatabaseEnabled()).toBe(false);
  });
});

describe("persistenceDisabledResponse", () => {
  it("is a 503 with a clear JSON error", async () => {
    const response = persistenceDisabledResponse();
    expect(response.status).toBe(503);
    await expect(response.json()).resolves.toEqual({ error: "persistence disabled" });
  });
});
