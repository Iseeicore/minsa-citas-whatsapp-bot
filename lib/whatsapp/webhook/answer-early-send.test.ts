import { beforeEach, describe, expect, it, vi } from "vitest";
import type { SendEffect } from "@/lib/fsm/core/types";
import type { TurnHooks } from "@/lib/fsm/core/executor";

const calls = vi.hoisted(() => ({ log: [] as string[] }));

const mocks = vi.hoisted(() => ({
  sendTypingIndicator: vi.fn(async () => {
    calls.log.push("typing");
  }),
  sendAndRecordEffect: vi.fn(async (_conversationId: unknown, _waId: string, effect: { text: string }) => {
    calls.log.push(`send:${effect.text}`);
  }),
  runTurnUnlocked: vi.fn(),
}));

vi.mock("@/lib/fsm/session/session-store", () => ({
  findSession: async () => ({ state: "cita_awaiting_dni", slots: {}, counters: {} }),
  saveSession: async () => undefined,
}));
vi.mock("@/lib/whatsapp/whatsapp-send", () => ({
  sendTypingIndicator: mocks.sendTypingIndicator,
  sendAndRecordEffect: mocks.sendAndRecordEffect,
  sendWhatsAppEffect: vi.fn(async () => undefined),
}));
vi.mock("@/lib/fsm/core/executor", () => ({ runTurnUnlocked: mocks.runTurnUnlocked }));

import { answerMessage } from "@/lib/whatsapp/webhook/answer";

const MESSAGE = {
  from_user_id: "wa-early",
  id: "wamid.early",
  timestamp: "1700000000",
  type: "text",
  text: { body: "12345678" },
} as unknown as Parameters<typeof answerMessage>[0];

const effect = (text: string): SendEffect => ({ kind: "send_text", text });

describe("answerMessage: the citizen never waits in silence", () => {
  beforeEach(() => {
    calls.log.length = 0;
    vi.clearAllMocks();
  });

  it("shows the typing indicator before the turn starts", async () => {
    mocks.runTurnUnlocked.mockImplementation(async () => {
      calls.log.push("turn");
      return { sent: [], session: { state: "cita_awaiting_dni", slots: {}, counters: {} } };
    });

    await answerMessage(MESSAGE, null);

    expect(calls.log[0]).toBe("typing");
    expect(calls.log.indexOf("turn")).toBeGreaterThan(0);
  });

  it("sends the message produced before a query right away, re-shows typing during the wait, and never sends twice", async () => {
    mocks.runTurnUnlocked.mockImplementation(async (_waId: string, _event: unknown, hooks?: TurnHooks) => {
      await hooks?.onSend(effect("Verificando tu documento…"));
      await hooks?.onWaitingForQuery();
      calls.log.push("query");
      await hooks?.onSend(effect("Listo"));
      return {
        sent: [effect("Verificando tu documento…"), effect("Listo")],
        session: { state: "cita_awaiting_otp", slots: {}, counters: {} },
      };
    });

    await answerMessage(MESSAGE, null);

    const sends = calls.log.filter((entry) => entry.startsWith("send:"));
    expect(sends).toEqual(["send:Verificando tu documento…", "send:Listo"]);
    expect(calls.log.indexOf("send:Verificando tu documento…")).toBeLessThan(calls.log.indexOf("query"));
    const waitTyping = calls.log.lastIndexOf("typing", calls.log.indexOf("query"));
    expect(waitTyping).toBeGreaterThan(calls.log.indexOf("send:Verificando tu documento…"));
  });

  it("still sends every message when the turn returns them without using the hooks", async () => {
    mocks.runTurnUnlocked.mockImplementation(async () => ({
      sent: [effect("uno"), effect("dos")],
      session: { state: "main_menu", slots: {}, counters: {} },
    }));

    await answerMessage(MESSAGE, null);

    expect(calls.log.filter((entry) => entry.startsWith("send:"))).toEqual(["send:uno", "send:dos"]);
  });
});
