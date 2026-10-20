import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Session } from "@/lib/fsm/core/types";

const store = vi.hoisted(() => ({
  sessions: new Map<string, Session>(),
  registrar: vi.fn<(submission: unknown) => Promise<unknown>>(),
  log: [] as string[],
  sent: 0,
}));

vi.mock("@/lib/fsm/session/session-store", () => ({
  findSession: async (from: string) => store.sessions.get(from) ?? null,
  getSession: async (from: string) => structuredClone(store.sessions.get(from) ?? { state: "main_menu", slots: {}, counters: {} }),
  saveSession: async (from: string, session: Session) => {
    store.sessions.set(from, structuredClone(session));
  },
}));
vi.mock("@/lib/recepcion/servicio", () => ({ registrarIncidencia: store.registrar }));
vi.mock("@/lib/whatsapp/whatsapp-send", () => ({
  sendTypingIndicator: vi.fn(async (id: string) => {
    store.log.push(`read:${id}`);
  }),
  sendAndRecordEffect: vi.fn(async (_conversationId: unknown, _waId: string, effect: { text: string }) => {
    store.log.push(`send:${effect.text}`);
    store.sent += 1;
    return `wamid.out.${store.sent}`;
  }),
  sendWhatsAppEffect: vi.fn(async () => undefined),
}));

import { answerMessage } from "@/lib/whatsapp/webhook/answer";
import { IncidenciaButtonId } from "@/lib/enums/incidencia-button-id";
import { RegistrationStatus } from "@/lib/enums/registration-status";
import { SessionState } from "@/lib/enums/session-state";
import { SlotKey } from "@/lib/enums/slot-key";

const WA = "51999000555";
const RESUMEN_WAMID = "wamid.resumen";

const buttonReply = (id: string, buttonId: string, contextId?: string) =>
  ({
    from_user_id: WA,
    id,
    timestamp: "1700000000",
    type: "interactive",
    interactive: { type: "button_reply", button_reply: { id: buttonId, title: "x" } },
    ...(contextId ? { context: { from: "15550000000", id: contextId } } : {}),
  }) as unknown as Parameters<typeof answerMessage>[0];

beforeEach(() => {
  vi.useFakeTimers();
  store.sessions.clear();
  store.log.length = 0;
  store.sent = 0;
  vi.clearAllMocks();
  store.registrar.mockResolvedValue({ status: RegistrationStatus.ACCEPTED, codigo: "000123" });
  store.sessions.set(WA, {
    state: SessionState.INCIDENCIA_CONFIRM_REGISTRO,
    slots: { [SlotKey.DESCRIPCION_INCIDENCIA]: "Me cobraron una consulta gratuita", [SlotKey.INTERACTIVE_MESSAGE_ID]: RESUMEN_WAMID },
    counters: {},
  });
});
afterEach(() => vi.useRealTimers());

async function answer(message: Parameters<typeof answerMessage>[0]) {
  const answered = answerMessage(message, null);
  await vi.runAllTimersAsync();
  await answered;
}

describe("answerMessage with a tap on an old WhatsApp button", () => {
  it("a valid tap on the current message is marked as read before anything else and processed", async () => {
    await answer(buttonReply("wamid.tap-1", IncidenciaButtonId.CONFIRM_REGISTRO_SI, RESUMEN_WAMID));

    expect(store.log[0]).toBe("read:wamid.tap-1");
    expect(store.registrar).toHaveBeenCalledTimes(1);
    expect(store.log.some((entry) => entry.startsWith("send:"))).toBe(true);
  });

  it("'Cancelar' after 'Registrar' on the same message gets no reply and is never marked as read", async () => {
    await answer(buttonReply("wamid.tap-1", IncidenciaButtonId.CONFIRM_REGISTRO_SI, RESUMEN_WAMID));
    const afterRegister = structuredClone(store.sessions.get(WA));
    store.log.length = 0;

    await answer(buttonReply("wamid.tap-2", IncidenciaButtonId.CONFIRM_REGISTRO_NO, RESUMEN_WAMID));

    expect(store.log).toEqual([]);
    expect(store.sessions.get(WA)).toEqual(afterRegister);
  });

  it("typing 'sí' at the confirmation registers, and a later 'Cancelar' on that summary gets no reply and no read mark", async () => {
    await answer({
      from_user_id: WA,
      id: "wamid.typed",
      timestamp: "1700000000",
      type: "text",
      text: { body: "sí" },
    } as unknown as Parameters<typeof answerMessage>[0]);
    expect(store.registrar).toHaveBeenCalledTimes(1);
    const afterRegister = structuredClone(store.sessions.get(WA));
    store.log.length = 0;

    await answer(buttonReply("wamid.tap-2", IncidenciaButtonId.CONFIRM_REGISTRO_NO, RESUMEN_WAMID));

    expect(store.log).toEqual([]);
    expect(store.sessions.get(WA)).toEqual(afterRegister);
  });

  it("a tap without context is processed as today", async () => {
    await answer(buttonReply("wamid.tap-1", IncidenciaButtonId.CONFIRM_REGISTRO_SI));

    expect(store.log[0]).toBe("read:wamid.tap-1");
    expect(store.registrar).toHaveBeenCalledTimes(1);
  });
});
