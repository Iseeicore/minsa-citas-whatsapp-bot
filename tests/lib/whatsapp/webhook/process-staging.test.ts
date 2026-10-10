import { beforeEach, describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({ started: [] as string[], waiting: [] as Array<() => void> }));

vi.mock("@/lib/db/persistence", () => ({ isDatabaseEnabled: () => true }));
vi.mock("@/lib/db/actor", () => ({
  ACTOR_EXTERNO_META: "externo:meta",
  actorCiudadano: (waId: string) => `ciudadano:${waId}`,
  declararActor: () => Promise.resolve(0),
}));
vi.mock("@/lib/db/prisma", () => ({
  prisma: {
    $transaction: async (operations: Array<Promise<unknown>>) => {
      const results = await Promise.all(operations);
      return results.length === 2 && results[1] === undefined ? [results[0], { id: "u1" }] : results;
    },
    usuario: { upsert: () => Promise.resolve(undefined) },
    mensaje: { create: () => Promise.resolve(undefined), updateMany: () => Promise.resolve(undefined) },
  },
}));
vi.mock("@/lib/fsm/session/session-store", () => ({
  findSession: async () => ({ state: "main_menu" }),
  sessionRowExists: async () => true,
}));
vi.mock("@/lib/security/perimeter", () => ({ screenInbound: async () => ({ action: "CONTINUE" }) }));
vi.mock("@/lib/whatsapp/webhook/answer", () => ({
  answerMessage: vi.fn(),
  sendFixedReply: vi.fn(),
  answerFailure: vi.fn(),
}));
vi.mock("@/lib/whatsapp/inbound/postgres-inbound-buffer", () => ({ createPostgresInboundBuffer: () => ({}) }));
vi.mock("@/lib/whatsapp/inbound/inbound-coalescer", () => ({
  createInboundCoalescer: () => ({
    handle: async ({ message }: { message: { id: string } }) => {
      state.started.push(message.id);
      await new Promise<void>((resolve) => {
        state.waiting.push(resolve);
        if (state.started.length === 2) for (const release of state.waiting) release();
      });
    },
  }),
}));

import { processValue } from "@/lib/whatsapp/webhook/process";

describe("processValue with several messages in one delivery", () => {
  beforeEach(() => {
    state.started.length = 0;
    state.waiting.length = 0;
  });

  it("stores every message before any of them waits for its window, so they can be merged", async () => {
    await processValue({
      messages: [
        { id: "m1", from_user_id: "wa1", timestamp: "1700000000", type: "text", text: { body: "hola" } },
        { id: "m2", from_user_id: "wa1", timestamp: "1700000001", type: "text", text: { body: "quiero una cita" } },
      ],
    } as unknown as Parameters<typeof processValue>[0]);

    expect(state.started).toEqual(["m1", "m2"]);
  });
});
