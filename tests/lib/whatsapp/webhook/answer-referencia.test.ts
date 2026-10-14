import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Session } from "@/lib/fsm/core/types";
import { REFERENCIA_LOGIN_REQUIRED_TEXT } from "@/lib/constants/textos/referencia";
import { PostLoginFlow } from "@/lib/enums/post-login-flow";
import { SessionState } from "@/lib/enums/session-state";
import { SlotKey } from "@/lib/enums/slot-key";

const store = vi.hoisted(() => ({ session: undefined as Session | undefined }));

const mocks = vi.hoisted(() => ({
  saveSession: vi.fn<(waId: string, session: unknown) => Promise<void>>(async () => undefined),
  sendAndRecordEffect: vi.fn<(conversationId: unknown, waId: string, effect: { kind: string; text?: string }) => Promise<void>>(
    async () => undefined,
  ),
}));

vi.mock("@/lib/fsm/session/session-store", () => ({
  findSession: async () => store.session,
  getSession: async () => structuredClone(store.session),
  saveSession: mocks.saveSession,
}));
vi.mock("@/lib/whatsapp/whatsapp-send", () => ({
  sendTypingIndicator: async () => undefined,
  sendAndRecordEffect: mocks.sendAndRecordEffect,
  sendWhatsAppEffect: async () => undefined,
}));

import { answerMessage } from "@/lib/whatsapp/webhook/answer";

const message = (body: string) =>
  ({
    from_user_id: "wa-referencia",
    id: "wamid.referencia",
    timestamp: "1700000000",
    type: "text",
    text: { body },
  }) as unknown as Parameters<typeof answerMessage>[0];

const sentTexts = () => mocks.sendAndRecordEffect.mock.calls.flatMap(([, , effect]) => (effect.kind === "send_text" ? [effect.text] : []));

beforeEach(() => {
  store.session = undefined;
  vi.clearAllMocks();
});

afterEach(() => {
  vi.useRealTimers();
});

describe("the REFERENCIA keyword through the WhatsApp entry", () => {
  it("a first contact that writes the keyword asks to log in under the referencias purpose", async () => {
    await answerMessage(message("referencia"), null);

    const [, saved] = mocks.saveSession.mock.calls[0] as [string, Session];
    expect(saved.state).toBe(SessionState.CITA_AWAITING_DNI);
    expect(saved.slots[SlotKey.POST_LOGIN_FLOW]).toBe(PostLoginFlow.REFERENCIAS);
    expect(sentTexts()).toEqual([REFERENCIA_LOGIN_REQUIRED_TEXT]);
  });

  it("a person already in the menu that writes the keyword gets the same", async () => {
    vi.useFakeTimers();
    store.session = { state: SessionState.MAIN_MENU, slots: {}, counters: {} };

    const answered = answerMessage(message("referencia"), null);
    await vi.runAllTimersAsync();
    await answered;

    const [, saved] = mocks.saveSession.mock.calls[0] as [string, Session];
    expect(saved.state).toBe(SessionState.CITA_AWAITING_DNI);
    expect(saved.slots[SlotKey.POST_LOGIN_FLOW]).toBe(PostLoginFlow.REFERENCIAS);
    expect(sentTexts()).toEqual([REFERENCIA_LOGIN_REQUIRED_TEXT]);
  });
});
