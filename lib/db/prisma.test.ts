import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const constructed = vi.hoisted(() => ({ client: 0, adapter: 0 }));

vi.mock("@prisma/client", () => ({
  PrismaClient: class {
    conversation = { findMany: async () => ["row"] };
    constructor() {
      constructed.client++;
    }
    async $transaction(steps: unknown[]) {
      return steps;
    }
  },
}));
vi.mock("@prisma/adapter-neon", () => ({
  PrismaNeon: class {
    constructor() {
      constructed.adapter++;
    }
  },
}));

describe("the lazy Prisma client", () => {
  beforeEach(() => {
    vi.resetModules();
    constructed.client = 0;
    constructed.adapter = 0;
    delete (globalThis as { prisma?: unknown }).prisma;
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("is not constructed just by importing the module", async () => {
    await import("@/lib/db/prisma");
    expect(constructed).toEqual({ client: 0, adapter: 0 });
  });

  it("is constructed once, on first use, when the database is enabled", async () => {
    const { prisma } = await import("@/lib/db/prisma");
    await expect(prisma.conversation.findMany()).resolves.toEqual(["row"]);
    await prisma.$transaction([]);
    expect(constructed).toEqual({ client: 1, adapter: 1 });
  });

  it("refuses to be used, without ever connecting, when DATABASE_ENABLED=false", async () => {
    vi.stubEnv("DATABASE_ENABLED", "false");
    const { prisma } = await import("@/lib/db/prisma");

    expect(() => prisma.conversation).toThrow(/DATABASE_ENABLED=false/);
    expect(constructed).toEqual({ client: 0, adapter: 0 });
  });
});
