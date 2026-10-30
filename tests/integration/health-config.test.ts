import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { GET } from "@/app/api/health/route";

describe("GET /api/health with a configuration problem", () => {
  beforeEach(() => {
    vi.stubEnv("META_APP_SECRET", "secreto");
    vi.stubEnv("META_ACCESS_TOKEN", "token");
    vi.stubEnv("META_PHONE_NUMBER_ID", "123");
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("still answers 200, but degraded and naming each problem code", async () => {
    vi.stubEnv("DATABASE_ENABLED", "false");
    vi.stubEnv("AI_PROVIDER", "gemnini");

    const response = await GET();

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      status: "degraded",
      database: "disabled",
      config: ["AI_PROVIDER_UNKNOWN"],
    });
  });

  it("names a missing Meta secret as degraded", async () => {
    vi.stubEnv("DATABASE_ENABLED", "false");
    vi.stubEnv("META_APP_SECRET", "");

    const response = await GET();

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ status: "degraded", database: "disabled", config: ["META_APP_SECRET_MISSING"] });
  });
});
