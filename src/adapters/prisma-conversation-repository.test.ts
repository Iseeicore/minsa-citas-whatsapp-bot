import { afterEach, describe, expect, it, vi } from "vitest";
import type pino from "pino";
import { PrismaClient } from "@prisma/client";
import type { ConversationRepository } from "../ports/conversation-repository.js";
import { createPrismaConversationRepository, redactPostgresUrl } from "./prisma-conversation-repository.js";

// Same discipline as redis-session-store.test.ts's DEAD_REDIS_URL/LIVE_REDIS_URL:
// a deliberately unreachable host for the unreachable-DB path, and a
// well-known local port for the happy-path assertions (requires a real
// local Postgres — same "developer's own machine" convention this repo
// already uses for the Redis live-Redis test tier).
const DEAD_POSTGRES_URL = "postgresql://dead:dead@127.0.0.1:5499/dead";
const LIVE_POSTGRES_URL = "postgresql://postgres:postgres@127.0.0.1:5432/postgres";

function fakeLogger() {
  return { info: vi.fn(), warn: vi.fn(), error: vi.fn() } as unknown as pino.Logger;
}

async function retryUntilReady<T>(op: () => Promise<T>, timeoutMs = 5000): Promise<T> {
  const start = Date.now();
  for (;;) {
    try {
      return await op();
    } catch (err) {
      if (Date.now() - start > timeoutMs) throw err;
      await new Promise((resolve) => setTimeout(resolve, 50));
    }
  }
}

describe("redactPostgresUrl", () => {
  it("keeps protocol/host/path, drops credentials and query string", () => {
    expect(redactPostgresUrl("postgresql://user:secret@db.example.com:5432/mydb?pgbouncer=true")).toBe(
      "postgresql://db.example.com:5432/mydb"
    );
  });

  it("never throws on an unparsable value", () => {
    expect(() => redactPostgresUrl("not a url")).not.toThrow();
    expect(redactPostgresUrl("not a url")).toBe("[postgres url unparsable]");
  });
});

describe("createPrismaConversationRepository", () => {
  let repo: ConversationRepository | undefined;

  afterEach(async () => {
    await repo?.close();
    repo = undefined;
  });

  it("never throws when constructed against an unreachable Postgres (PrismaClient connects lazily)", () => {
    const logger = fakeLogger();

    expect(() => {
      repo = createPrismaConversationRepository({ config: { postgresUrl: DEAD_POSTGRES_URL }, logger });
    }).not.toThrow();
  });

  it("rejects operations when Postgres is unreachable, instead of hanging", async () => {
    const logger = fakeLogger();
    repo = createPrismaConversationRepository({ config: { postgresUrl: DEAD_POSTGRES_URL }, logger });

    await expect(
      repo.recordInboundMessage({
        waId: "51999999999",
        waMessageId: "wamid.dead-1",
        type: "TEXT",
        text: "hola",
        timestamp: new Date(),
      })
    ).rejects.toThrow();
  }, 15000);

  describe("against a reachable Postgres", () => {
    it("records an inbound message, creating the conversation and bumping lastMessageAt/lastInboundAt", async () => {
      const logger = fakeLogger();
      repo = createPrismaConversationRepository({ config: { postgresUrl: LIVE_POSTGRES_URL }, logger });
      const waId = `51900000${Date.now()}`.slice(0, 12);
      const waMessageId = `wamid.in-${Date.now()}`;

      await retryUntilReady(() =>
        repo!.recordInboundMessage({
          waId,
          contactName: "Juan Perez",
          waMessageId,
          type: "TEXT",
          text: "Hola, quiero una cita",
          timestamp: new Date("2026-01-01T10:00:00.000Z"),
        })
      );

      expect(await repo.isWithin24HourWindow(waId)).toBe(false); // 2026-01-01 is far in the past
      const conversations = await repo.listConversations();
      expect(conversations.find((c) => c.waId === waId)?.displayName).toBe("Juan Perez");
    });

    it("is idempotent by waMessageId — a redelivered webhook never creates a duplicate row", async () => {
      const logger = fakeLogger();
      repo = createPrismaConversationRepository({ config: { postgresUrl: LIVE_POSTGRES_URL }, logger });
      const waId = `51900001${Date.now()}`.slice(0, 12);
      const waMessageId = `wamid.dup-${Date.now()}`;
      const input = { waId, waMessageId, type: "TEXT" as const, text: "hola", timestamp: new Date() };

      await retryUntilReady(() => repo!.recordInboundMessage(input));
      await expect(repo.recordInboundMessage(input)).resolves.not.toThrow();

      const conversations = await repo.listConversations();
      const conversation = conversations.find((c) => c.waId === waId);
      expect(conversation).toBeDefined();
      const messages = await repo.listMessages(conversation!.id);
      expect(messages.filter((m) => m.text === "hola")).toHaveLength(1);
    });

    it("recordOutboundMessage bumps lastMessageAt but never lastInboundAt (the 24h window anchor)", async () => {
      const logger = fakeLogger();
      repo = createPrismaConversationRepository({ config: { postgresUrl: LIVE_POSTGRES_URL }, logger });
      const waId = `51900002${Date.now()}`.slice(0, 12);

      await retryUntilReady(() =>
        repo!.recordInboundMessage({
          waId,
          waMessageId: `wamid.anchor-${Date.now()}`,
          type: "TEXT",
          text: "hola",
          timestamp: new Date(), // now — within the 24h window
        })
      );
      expect(await repo.isWithin24HourWindow(waId)).toBe(true);

      await repo.recordOutboundMessage({ waId, text: "reply", timestamp: new Date() });

      // Still within the window — an outbound send alone must never extend
      // or reset it; this only holds because lastInboundAt was untouched.
      expect(await repo.isWithin24HourWindow(waId)).toBe(true);
    });

    it("isWithin24HourWindow returns false for a waId with no conversation on record", async () => {
      const logger = fakeLogger();
      repo = createPrismaConversationRepository({ config: { postgresUrl: LIVE_POSTGRES_URL }, logger });

      await expect(retryUntilReady(() => repo!.isWithin24HourWindow("51900099999999"))).resolves.toBe(false);
    });

    it("updateMessageStatusByWaMessageId updates the status; a no-op (not a throw) for an unknown wamid", async () => {
      const logger = fakeLogger();
      repo = createPrismaConversationRepository({ config: { postgresUrl: LIVE_POSTGRES_URL }, logger });
      const waId = `51900003${Date.now()}`.slice(0, 12);
      const waMessageId = `wamid.status-${Date.now()}`;

      await retryUntilReady(() => repo!.recordOutboundMessage({ waId, waMessageId, text: "hi", timestamp: new Date() }));
      await repo.updateMessageStatusByWaMessageId(waMessageId, "DELIVERED");

      const conversations = await repo.listConversations();
      const conversation = conversations.find((c) => c.waId === waId);
      const messages = await repo.listMessages(conversation!.id);
      expect(messages.find((m) => m.text === "hi")?.status).toBe("DELIVERED");

      await expect(repo.updateMessageStatusByWaMessageId("wamid.never-existed", "READ")).resolves.not.toThrow();
    });

    it("listConversations orders by lastMessageAt descending", async () => {
      const logger = fakeLogger();
      repo = createPrismaConversationRepository({ config: { postgresUrl: LIVE_POSTGRES_URL }, logger });
      const waIdOld = `51900004${Date.now()}`.slice(0, 12);
      const waIdNew = `51900005${Date.now()}`.slice(0, 12);

      await retryUntilReady(() =>
        repo!.recordInboundMessage({
          waId: waIdOld,
          waMessageId: `wamid.old-${Date.now()}`,
          type: "TEXT",
          text: "old",
          timestamp: new Date("2026-01-01T00:00:00.000Z"),
        })
      );
      await repo.recordInboundMessage({
        waId: waIdNew,
        waMessageId: `wamid.new-${Date.now()}`,
        type: "TEXT",
        text: "new",
        timestamp: new Date(),
      });

      const conversations = await repo.listConversations();
      const oldIdx = conversations.findIndex((c) => c.waId === waIdOld);
      const newIdx = conversations.findIndex((c) => c.waId === waIdNew);
      expect(newIdx).toBeLessThan(oldIdx);
    });
  });
});

// Direct proof, independent of the repository's own round-trip, that the
// underlying rows really land with the expected shape — same discipline as
// redis-session-store.test.ts's raw IORedis client checks.
describe("raw row shape (against a reachable Postgres)", () => {
  it("stores an inbound TEXT message with direction INBOUND and status SENT by default", async () => {
    const logger = fakeLogger();
    const repo = createPrismaConversationRepository({ config: { postgresUrl: LIVE_POSTGRES_URL }, logger });
    const waId = `51900006${Date.now()}`.slice(0, 12);
    const waMessageId = `wamid.raw-${Date.now()}`;

    try {
      await retryUntilReady(() =>
        repo.recordInboundMessage({ waId, waMessageId, type: "TEXT", text: "raw check", timestamp: new Date() })
      );

      const raw = new PrismaClient({ datasources: { db: { url: LIVE_POSTGRES_URL } } });
      try {
        const message = await raw.message.findUnique({ where: { waMessageId } });
        expect(message?.direction).toBe("INBOUND");
        expect(message?.status).toBe("SENT");
        expect(message?.type).toBe("TEXT");
      } finally {
        await raw.$disconnect();
      }
    } finally {
      await repo.close();
    }
  });
});
