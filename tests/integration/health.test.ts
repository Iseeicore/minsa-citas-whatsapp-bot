import { afterEach, describe, expect, it, vi } from "vitest";

// The container HEALTHCHECK probes /api/health: it must answer from the running
// process alone, never from the database.
const db = vi.hoisted(() => ({ touched: 0 }));
vi.mock("@/lib/db/prisma", () => ({
  prisma: new Proxy(
    {},
    {
      get() {
        db.touched++;
        throw new Error("the health check touched Prisma");
      },
    },
  ),
}));

import { dynamic, GET } from "@/app/api/health/route";

describe("GET /api/health", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("answers 200 with a tiny JSON body, without touching the database", async () => {
    vi.stubEnv("DATABASE_ENABLED", "false");
    const response = await GET();

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ status: "ok", database: "disabled" });
    expect(db.touched).toBe(0);
  });

  it("reports the database mode it runs in, still without connecting", async () => {
    const response = await GET();
    await expect(response.json()).resolves.toEqual({ status: "ok", database: "enabled" });
    expect(db.touched).toBe(0);
  });

  it("is evaluated on every request, never frozen at build time", () => {
    expect(dynamic).toBe("force-dynamic");
  });
});
