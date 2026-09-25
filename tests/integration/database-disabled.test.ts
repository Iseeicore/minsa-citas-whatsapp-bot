import crypto from "node:crypto";
import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

// The real webhook pipeline (route → perimeter → dedupe → turn lock → FSM →
// session store) with DATABASE_ENABLED=false: every message is answered and the
// conversation advances, yet Prisma is never constructed — not even with a
// DATABASE_URL present, which would otherwise wire the Postgres turn lock.
const state = vi.hoisted(() => {
  process.env.DATABASE_ENABLED = "false";
  process.env.DATABASE_URL = "postgresql://unused:unused@localhost:5432/unused";
  return {
    prismaConstructed: 0,
    adapterConstructed: 0,
    afterPromises: [] as Promise<unknown>[],
    sent: [] as Array<{ conversationId: unknown; waId: string; text: string }>,
  };
});

vi.mock("@prisma/client", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@prisma/client")>()),
  PrismaClient: class {
    constructor() {
      state.prismaConstructed++;
      throw new Error("PrismaClient must not be constructed with DATABASE_ENABLED=false");
    }
  },
}));
vi.mock("@prisma/adapter-neon", () => ({
  PrismaNeon: class {
    constructor() {
      state.adapterConstructed++;
    }
  },
}));
vi.mock("next/server", async (importOriginal) => ({
  ...(await importOriginal<typeof import("next/server")>()),
  after: (task: () => Promise<unknown>) => {
    state.afterPromises.push(task());
  },
}));
// Only the network edge is replaced: the WhatsApp Graph API.
vi.mock("@/lib/whatsapp/whatsapp-send", () => ({
  sendWhatsAppEffect: vi.fn(async () => new Response("{}", { status: 200 })),
  sendTypingIndicator: vi.fn(async () => undefined),
  sendAndRecordCtaUrl: vi.fn(async () => undefined),
  sendAndRecordEffect: vi.fn(async (conversationId: unknown, waId: string, effect: { text: string }) => {
    state.sent.push({ conversationId, waId, text: effect.text });
  }),
}));

import { POST } from "@/app/webhook/whatsapp/route";
import { getSession } from "@/lib/fsm/session/session-store";

const SECRET = "test-app-secret";
const WA_ID = "51911199999";

async function deliver(value: Record<string, unknown>) {
  const body = JSON.stringify({ entry: [{ changes: [{ value: { contacts: [], ...value } }] }] });
  const signature = "sha256=" + crypto.createHmac("sha256", SECRET).update(body).digest("hex");
  const response = await POST(
    new NextRequest("http://localhost/webhook/whatsapp", {
      method: "POST",
      headers: { "x-hub-signature-256": signature, "content-type": "application/json" },
      body,
    }),
  );
  await Promise.all(state.afterPromises.splice(0));
  return response;
}

const text = (id: string, body: string) => ({
  id,
  from_user_id: WA_ID,
  timestamp: "1780000000",
  type: "text",
  text: { body },
});

beforeEach(() => {
  process.env.META_APP_SECRET = SECRET;
  vi.stubGlobal(
    "fetch",
    vi.fn(async () => {
      throw new Error("no network in this test");
    }),
  );
});

afterAll(() => {
  delete process.env.DATABASE_ENABLED;
  delete process.env.DATABASE_URL;
  vi.unstubAllGlobals();
});

describe("webhook with DATABASE_ENABLED=false", () => {
  it("answers, advances the conversation in memory, skips redeliveries and never builds Prisma", async () => {
    expect((await deliver({ messages: [text("wamid.first", "Hola")] })).status).toBe(200);
    const afterFirst = state.sent.length;
    expect(afterFirst).toBeGreaterThan(0);
    const sessionAfterFirst = await getSession(WA_ID);
    expect(sessionAfterFirst.updatedAt).toBeInstanceOf(Date);

    // Meta redelivers the same message id: answered exactly once.
    await deliver({ messages: [text("wamid.first", "Hola")] });
    expect(state.sent.length).toBe(afterFirst);

    // A new message continues from the in-memory session.
    await deliver({ messages: [text("wamid.second", "1")] });
    expect(state.sent.length).toBeGreaterThan(afterFirst);
    expect((await getSession(WA_ID)).state).not.toBe(sessionAfterFirst.state);

    // Delivery statuses have no message history to update.
    await deliver({ statuses: [{ id: "wamid.out", status: "delivered" }] });

    // No inbox history: nothing is recorded against a conversation row.
    expect(state.sent.every((send) => send.conversationId === null)).toBe(true);
    expect(state.prismaConstructed).toBe(0);
    expect(state.adapterConstructed).toBe(0);
  }, 30_000);
});
