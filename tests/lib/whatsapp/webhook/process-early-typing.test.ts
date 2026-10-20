import { beforeEach, describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({
  decisions: new Map<string, { action: string; reply?: string }>(),
  order: [] as string[],
  typing: vi.fn(async (id: string) => {
    state.order.push(`typing:${id}`);
  }),
  fixedReply: vi.fn(async () => undefined),
}));

vi.mock("@/lib/db/persistence", () => ({ isDatabaseEnabled: () => true }));
vi.mock("@/lib/db/actor", () => ({
  ACTOR_EXTERNO_META: "externo:meta",
  actorCiudadano: (waId: string) => `ciudadano:${waId}`,
  declararActor: () => Promise.resolve(0),
}));
vi.mock("@/lib/db/prisma", () => ({
  prisma: {
    $transaction: async (operations: Array<Promise<unknown>>) => {
      state.order.push("db:usuario");
      const results = await Promise.all(operations);
      return results.length === 2 && results[1] === undefined ? [results[0], { id: "u1" }] : results;
    },
    usuario: { upsert: () => Promise.resolve(undefined) },
    mensaje: { create: () => Promise.resolve(undefined), updateMany: () => Promise.resolve(undefined) },
  },
}));
vi.mock("@/lib/fsm/session/session-store", () => ({
  findSession: async () => null,
  sessionRowExists: async () => false,
}));
vi.mock("@/lib/security/perimeter", () => ({
  screenInbound: async ({ messageId }: { messageId: string }) => state.decisions.get(messageId) ?? { action: "CONTINUE" },
}));
vi.mock("@/lib/whatsapp/webhook/answer", () => ({
  answerMessage: vi.fn(),
  sendFixedReply: state.fixedReply,
  answerFailure: vi.fn(),
}));
vi.mock("@/lib/whatsapp/whatsapp-send", () => ({ sendTypingIndicator: state.typing }));
vi.mock("@/lib/whatsapp/inbound/postgres-inbound-buffer", () => ({ createPostgresInboundBuffer: () => ({}) }));
vi.mock("@/lib/whatsapp/inbound/inbound-coalescer", () => ({
  createInboundCoalescer: () => ({
    handle: async ({ message }: { message: { id: string } }) => {
      state.order.push(`handle:${message.id}`);
    },
  }),
}));

import { processValue } from "@/lib/whatsapp/webhook/process";
import { PerimeterAction } from "@/lib/enums/perimeter-action";

const message = (id: string, body = "hola") => ({ id, from_user_id: "wa1", timestamp: "1700000000", type: "text", text: { body } });

describe("the read / typing signal on an inbound message", () => {
  beforeEach(() => {
    state.decisions.clear();
    state.order.length = 0;
    vi.clearAllMocks();
  });

  it("goes out as soon as the perimeter lets the message through, before any database work", async () => {
    await processValue({ messages: [message("m1")] } as unknown as Parameters<typeof processValue>[0]);

    expect(state.typing).toHaveBeenCalledTimes(1);
    expect(state.typing).toHaveBeenCalledWith("m1");
    expect(state.order[0]).toBe("typing:m1");
    expect(state.order.at(-1)).toBe("handle:m1");
  });

  it("waits for the turn when the message is a tap on a button or list row that may be stale", async () => {
    const tapReply = {
      id: "tap1",
      from_user_id: "wa1",
      timestamp: "1700000000",
      type: "interactive",
      interactive: { type: "button_reply", button_reply: { id: "si", title: "Sí" } },
      context: { from: "15550000000", id: "wamid.out" },
    };
    const listReply = { ...tapReply, id: "tap2", interactive: { type: "list_reply", list_reply: { id: "1", title: "Uno" } } };

    await processValue({ messages: [tapReply, listReply] } as unknown as Parameters<typeof processValue>[0]);

    expect(state.typing).not.toHaveBeenCalled();
    expect(state.order).toContain("handle:tap1");
    expect(state.order).toContain("handle:tap2");
  });

  it("still goes out early for a tap that does not say which message it answers", async () => {
    const tapReply = {
      id: "tap3",
      from_user_id: "wa1",
      timestamp: "1700000000",
      type: "interactive",
      interactive: { type: "button_reply", button_reply: { id: "si", title: "Sí" } },
    };

    await processValue({ messages: [tapReply] } as unknown as Parameters<typeof processValue>[0]);

    expect(state.typing).toHaveBeenCalledWith("tap3");
  });

  it("is never sent for a message the perimeter drops or rejects: spam and stickers get no sign of life", async () => {
    state.decisions.set("spam", { action: PerimeterAction.DROP });
    state.decisions.set("long", { action: PerimeterAction.REJECT, reply: "Mensaje no reconocido." });

    await processValue({ messages: [message("spam"), message("long", "a".repeat(400))] } as unknown as Parameters<typeof processValue>[0]);

    expect(state.typing).not.toHaveBeenCalled();
    expect(state.fixedReply).toHaveBeenCalledWith("wa1", "Mensaje no reconocido.");
  });
});
