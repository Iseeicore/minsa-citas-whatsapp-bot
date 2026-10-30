import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import type { Session } from "@/lib/fsm/core/types";

const store = vi.hoisted(() => ({
  sessions: new Map<string, Session>(),
  registrar: vi.fn<(submission: unknown) => Promise<unknown>>(),
}));

vi.mock("@/lib/fsm/session/session-store", () => ({
  getSession: async (from: string) => structuredClone(store.sessions.get(from) ?? { state: "main_menu", slots: {}, counters: {} }),
  saveSession: async (from: string, session: Session) => {
    store.sessions.set(from, structuredClone({ ...session, updatedAt: undefined }));
  },
  sessionRowExists: async (from: string) => store.sessions.has(from),
  resetSession: async (from: string) => {
    store.sessions.delete(from);
  },
}));
vi.mock("@/lib/recepcion/servicio", () => ({ registrarIncidencia: store.registrar }));

import { POST } from "@/app/api/sandbox/route";
import { IncidenciaButtonId } from "@/lib/enums/incidencia-button-id";
import { RegistrationStatus } from "@/lib/enums/registration-status";
import { SendType } from "@/lib/enums/send-type";
import { SessionState } from "@/lib/enums/session-state";
import { SlotKey } from "@/lib/enums/slot-key";
import { ReferenciaChoiceButtonId } from "@/lib/enums/referencia-choice-button-id";
import { REFERENCIA_LOGIN_REQUIRED_TEXT } from "@/lib/constants/textos/referencia";
import { ASK_DOCUMENTO_TEXT } from "@/lib/constants/textos/identidad";

const FROM = "sandbox-stale-tap";
const RESUMEN_ID = "web-resumen";

type Reply = { sent: Array<{ kind: string; text?: string }>; session: { state: string }; interactiveId?: string };

async function send(body: Record<string, unknown>): Promise<Reply> {
  const request = new NextRequest("http://localhost/api/sandbox", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ from: FROM, ...body }),
  });
  return (await POST(request)).json() as Promise<Reply>;
}

const confirming = (): Session => ({
  state: SessionState.INCIDENCIA_CONFIRM_REGISTRO,
  slots: { [SlotKey.DESCRIPCION_INCIDENCIA]: "Me cobraron una consulta gratuita", [SlotKey.INTERACTIVE_MESSAGE_ID]: RESUMEN_ID },
  counters: {},
});

beforeEach(() => {
  process.env.SANDBOX_ENABLED = "true";
  store.sessions.clear();
  vi.clearAllMocks();
  store.registrar.mockResolvedValue({ status: RegistrationStatus.ACCEPTED, codigo: "000123" });
});

describe("the Sandbox applies the same rule to old buttons", () => {
  it("the welcome reply tells the page which interactive message is the current one", async () => {
    const reply = await send({ type: "text", text: "Hola", reset: true });

    expect(reply.sent.some((effect) => effect.kind === SendType.BUTTONS || effect.kind === SendType.INTERACTIVE_LIST)).toBe(true);
    expect(reply.interactiveId).toEqual(expect.any(String));
    expect(store.sessions.get(FROM)?.slots[SlotKey.INTERACTIVE_MESSAGE_ID]).toBe(reply.interactiveId);
  });

  it("a tap on an older message is ignored: no reply, no state change, no registration", async () => {
    store.sessions.set(FROM, confirming());
    const before = structuredClone(store.sessions.get(FROM));

    const reply = await send({ type: "button", listId: IncidenciaButtonId.CONFIRM_REGISTRO_SI, replyTo: "web-anterior" });

    expect(reply.sent).toEqual([]);
    expect(reply.session.state).toBe(SessionState.INCIDENCIA_CONFIRM_REGISTRO);
    expect(store.sessions.get(FROM)).toEqual(before);
    expect(store.registrar).not.toHaveBeenCalled();
  });

  it("a double tap on 'Registrar' registers once", async () => {
    store.sessions.set(FROM, confirming());

    const first = await send({ type: "button", listId: IncidenciaButtonId.CONFIRM_REGISTRO_SI, replyTo: RESUMEN_ID });
    const second = await send({ type: "button", listId: IncidenciaButtonId.CONFIRM_REGISTRO_SI, replyTo: RESUMEN_ID });

    expect(first.sent.length).toBeGreaterThan(0);
    expect(first.interactiveId).toBeUndefined();
    expect(second.sent).toEqual([]);
    expect(store.registrar).toHaveBeenCalledTimes(1);
  });

  it("typing 'sí' at the confirmation registers, and a later tap on that summary is ignored", async () => {
    store.sessions.set(FROM, confirming());

    const typed = await send({ type: "text", text: "sí" });
    const before = structuredClone(store.sessions.get(FROM));
    const tapped = await send({ type: "button", listId: IncidenciaButtonId.CONFIRM_REGISTRO_NO, replyTo: RESUMEN_ID });

    expect(typed.session.state).toBe(SessionState.INCIDENCIA_CONFIRMED);
    expect(typed.interactiveId).toBeUndefined();
    expect(tapped.sent).toEqual([]);
    expect(store.sessions.get(FROM)).toEqual(before);
    expect(store.registrar).toHaveBeenCalledTimes(1);
  });

  it("an unrecognized text that leaves the state unchanged keeps the current buttons valid", async () => {
    store.sessions.set(FROM, confirming());

    const typed = await send({ type: "text", text: "no entendí" });
    const tapped = await send({
      type: "button",
      listId: IncidenciaButtonId.CONFIRM_REGISTRO_SI,
      replyTo: typed.interactiveId ?? RESUMEN_ID,
    });

    expect(typed.session.state).toBe(SessionState.INCIDENCIA_CONFIRM_REGISTRO);
    expect(tapped.sent.length).toBeGreaterThan(0);
    expect(store.registrar).toHaveBeenCalledTimes(1);
  });

  it("a tap that does not say which message it answers is processed as today", async () => {
    store.sessions.set(FROM, confirming());

    const reply = await send({ type: "button", listId: IncidenciaButtonId.CONFIRM_REGISTRO_SI });

    expect(reply.sent.length).toBeGreaterThan(0);
    expect(store.registrar).toHaveBeenCalledTimes(1);
  });
});

describe("the Sandbox answers a referencia that is not a plain request with the same two-button choice", () => {
  it("shows the buttons, accepts a tap on them and ignores a tap on an older message", async () => {
    const shown = await send({ type: "text", text: "¿Ya aceptaron mi referencia?", reset: true });
    const buttons = shown.sent.find((effect) => effect.kind === SendType.BUTTONS) as
      { kind: string; text?: string; buttons?: Array<{ id: string; title: string }> } | undefined;

    expect(buttons?.text).toBe(
      "Gestión de Referencias Médicas:\n\nPara una cita en hospital o instituto, tu centro de origen debe emitir la Hoja de Referencia (REFCON).\n\n¿Qué deseas hacer?",
    );
    expect(buttons?.buttons?.map((button) => button.title)).toEqual(["Cita con referencia", "Agendar cita"]);
    expect(shown.session.state).toBe(SessionState.MAIN_MENU_REFERENCIA_CHOICE);

    const old = await send({ type: "button", listId: ReferenciaChoiceButtonId.AGENDAR_CITA, replyTo: "web-anterior" });
    expect(old.sent).toEqual([]);
    expect(old.session.state).toBe(SessionState.MAIN_MENU_REFERENCIA_CHOICE);

    const current = await send({ type: "button", listId: ReferenciaChoiceButtonId.CONSULTAR_REFERENCIA, replyTo: shown.interactiveId });
    expect(current.sent).toEqual([{ kind: SendType.TEXT, text: REFERENCIA_LOGIN_REQUIRED_TEXT }]);
    expect(current.session.state).toBe(SessionState.CITA_AWAITING_DNI);
  });

  it("typing 2 after the choice starts the cita", async () => {
    await send({ type: "text", text: "quiero una cita por referencia", reset: true });

    const reply = await send({ type: "text", text: "2" });

    expect(reply.sent).toEqual([{ kind: SendType.TEXT, text: ASK_DOCUMENTO_TEXT }]);
    expect(reply.session.state).toBe(SessionState.CITA_AWAITING_DNI);
  });
});
