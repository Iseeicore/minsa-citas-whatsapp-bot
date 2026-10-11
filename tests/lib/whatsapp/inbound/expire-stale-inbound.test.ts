import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { INBOUND_MAX_AGE_MS } from "@/lib/whatsapp/inbound/inbound-policy";

const buffer = vi.hoisted(() => ({ expireStale: vi.fn<(olderThan: Date) => Promise<number>>(async () => 2) }));

vi.mock("@/lib/whatsapp/inbound/postgres-inbound-buffer", () => ({ createPostgresInboundBuffer: () => buffer }));

import { expireStaleInbound } from "@/lib/whatsapp/inbound/expire-stale-inbound";

describe("expireStaleInbound", () => {
  beforeEach(() => vi.clearAllMocks());
  afterEach(() => vi.unstubAllEnvs());

  it("expires the pending messages older than the maximum age and sends nothing", async () => {
    vi.stubEnv("DATABASE_ENABLED", "true");
    const now = Date.parse("2026-10-10T12:00:00Z");

    await expireStaleInbound(() => now);

    expect(buffer.expireStale).toHaveBeenCalledWith(new Date(now - INBOUND_MAX_AGE_MS));
  });

  it("does nothing without a database", async () => {
    vi.stubEnv("DATABASE_ENABLED", "false");

    await expireStaleInbound();

    expect(buffer.expireStale).not.toHaveBeenCalled();
  });

  it("never blocks the server start when the database is unreachable", async () => {
    vi.stubEnv("DATABASE_ENABLED", "true");
    buffer.expireStale.mockRejectedValueOnce(new Error("connection refused"));

    await expect(expireStaleInbound()).resolves.toBeUndefined();
  });
});
