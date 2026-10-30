import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { InboundEvent, SendEffect, Session } from "@/lib/fsm/core/types";

const store = vi.hoisted(() => ({
  sessions: new Map<string, Session>(),
  registrar: vi.fn<(submission: unknown) => Promise<unknown>>(),
}));

vi.mock("@/lib/fsm/session/session-store", () => ({
  getSession: async (from: string) => {
    await new Promise((resolve) => setTimeout(resolve, 5));
    return structuredClone(store.sessions.get(from) ?? { state: "main_menu", slots: {}, counters: {} });
  },
  saveSession: async (from: string, session: Session) => {
    await new Promise((resolve) => setTimeout(resolve, 5));
    store.sessions.set(from, structuredClone({ ...session, updatedAt: undefined }));
  },
}));
vi.mock("@/lib/recepcion/servicio", () => ({ registrarIncidencia: store.registrar }));
vi.mock("@/lib/composition/stores", () => import("@/tests/support/memory-stores"));
vi.mock("@/lib/recepcion/repositorio", () => ({
  tieneConsentimientoAceptado: async () => false,
  marcarConsentimientoAceptado: async () => undefined,
}));

import { runTurn, runTurnUnlocked, type TurnHooks } from "@/lib/fsm/core/executor";
import { configureLogger } from "@/lib/observability/logger";
import { IncidenciaButtonId } from "@/lib/enums/incidencia-button-id";
import { InboundEventType } from "@/lib/enums/inbound-event-type";
import { RegistrationStatus } from "@/lib/enums/registration-status";
import { SessionState } from "@/lib/enums/session-state";
import { SlotKey } from "@/lib/enums/slot-key";
import { REFERENCIA_LOGIN_REQUIRED_TEXT } from "@/lib/constants/textos/referencia";
import { MenuChoice } from "@/lib/enums/menu-choice";
import { PostLoginFlow } from "@/lib/enums/post-login-flow";
import { ReferenciaChoiceButtonId } from "@/lib/enums/referencia-choice-button-id";

const FROM = "51999000444";
const RESUMEN_WAMID = "wamid.resumen";

let raw: string[] = [];
let restore: () => void;
const staleLines = () =>
  raw.map((line) => JSON.parse(line) as Record<string, unknown>).filter((line) => line.event === "inbound.stale_tap");

function confirming(slots: Session["slots"] = { [SlotKey.INTERACTIVE_MESSAGE_ID]: RESUMEN_WAMID }): Session {
  return {
    state: SessionState.INCIDENCIA_CONFIRM_REGISTRO,
    slots: { [SlotKey.DESCRIPCION_INCIDENCIA]: "Me cobraron una consulta que debía ser gratuita", ...slots },
    counters: {},
  };
}

const tap = (listId: string, replyTo?: string): InboundEvent => ({
  from: FROM,
  type: InboundEventType.BUTTON,
  listId,
  ...(replyTo ? { replyTo } : {}),
});

function recordingHooks() {
  const calls: string[] = [];
  let next = 0;
  const hooks: TurnHooks = {
    onSend: async (effect: SendEffect) => {
      calls.push(`send:${effect.text}`);
      next += 1;
      return `wamid.out.${next}`;
    },
    onWaitingForQuery: async () => {
      calls.push("wait");
    },
    onAccepted: async () => {
      calls.push("accepted");
    },
  };
  return { hooks, calls };
}

beforeEach(() => {
  raw = [];
  store.sessions.clear();
  vi.clearAllMocks();
  store.registrar.mockResolvedValue({ status: RegistrationStatus.ACCEPTED, codigo: "000123" });
  restore = configureLogger({ sink: (_level, line) => raw.push(line), level: "info" });
});
afterEach(() => restore());

describe("a tap on a WhatsApp button that is no longer current", () => {
  it("'Cancelar' tapped after 'Registrar' on the same message is ignored: no send, no state change, no read mark, logged", async () => {
    store.sessions.set(FROM, confirming());
    const first = recordingHooks();
    await runTurnUnlocked(FROM, tap(IncidenciaButtonId.CONFIRM_REGISTRO_SI, RESUMEN_WAMID), first.hooks);
    const afterRegister = structuredClone(store.sessions.get(FROM));
    expect(afterRegister?.state).toBe(SessionState.INCIDENCIA_CONFIRMED);

    const second = recordingHooks();
    const result = await runTurnUnlocked(FROM, tap(IncidenciaButtonId.CONFIRM_REGISTRO_NO, RESUMEN_WAMID), second.hooks);

    expect(result.sent).toEqual([]);
    expect(second.calls).toEqual([]);
    expect(store.sessions.get(FROM)).toEqual(afterRegister);
    expect(store.registrar).toHaveBeenCalledTimes(1);
    expect(staleLines()).toHaveLength(1);
    expect(staleLines()[0]).toMatchObject({ level: "info", waId: "...0444", state: SessionState.INCIDENCIA_CONFIRMED });
    expect(JSON.stringify(staleLines()[0])).not.toContain(FROM);
  });

  it("a button from a previous incidencia's summary, tapped while confirming a new one, is ignored", async () => {
    store.sessions.set(FROM, confirming({ [SlotKey.INTERACTIVE_MESSAGE_ID]: "wamid.resumen-nuevo" }));
    const before = structuredClone(store.sessions.get(FROM));
    const { hooks, calls } = recordingHooks();

    const result = await runTurnUnlocked(FROM, tap(IncidenciaButtonId.CONFIRM_REGISTRO_SI, "wamid.resumen-viejo"), hooks);

    expect(result.sent).toEqual([]);
    expect(calls).toEqual([]);
    expect(store.registrar).not.toHaveBeenCalled();
    expect(store.sessions.get(FROM)).toEqual(before);
    expect(staleLines()).toHaveLength(1);
  });

  it("a double tap on 'Registrar' registers once and ignores the second tap", async () => {
    store.sessions.set(FROM, confirming());

    await runTurnUnlocked(FROM, tap(IncidenciaButtonId.CONFIRM_REGISTRO_SI, RESUMEN_WAMID), recordingHooks().hooks);
    const second = recordingHooks();
    const result = await runTurnUnlocked(FROM, tap(IncidenciaButtonId.CONFIRM_REGISTRO_SI, RESUMEN_WAMID), second.hooks);

    expect(store.registrar).toHaveBeenCalledTimes(1);
    expect(result.sent).toEqual([]);
    expect(second.calls).toEqual([]);
    expect(store.sessions.get(FROM)?.slots[SlotKey.INTERACTIVE_MESSAGE_CONSUMED]).toBe(true);
  });

  it("two concurrent taps on 'Registrar' are serialized by the turn lock: one registration, the other is ignored", async () => {
    store.sessions.set(FROM, confirming());
    const a = recordingHooks();
    const b = recordingHooks();

    const results = await Promise.all([
      runTurn(FROM, tap(IncidenciaButtonId.CONFIRM_REGISTRO_SI, RESUMEN_WAMID), a.hooks),
      runTurn(FROM, tap(IncidenciaButtonId.CONFIRM_REGISTRO_SI, RESUMEN_WAMID), b.hooks),
    ]);

    expect(store.registrar).toHaveBeenCalledTimes(1);
    expect(results.filter((result) => result.sent.length === 0)).toHaveLength(1);
    expect(staleLines()).toHaveLength(1);
  });

  it("even without any message id, the lock alone keeps a second concurrent tap away from the pending submission", async () => {
    store.sessions.set(FROM, confirming({}));

    const results = await Promise.all([
      runTurn(FROM, tap(IncidenciaButtonId.CONFIRM_REGISTRO_SI)),
      runTurn(FROM, tap(IncidenciaButtonId.CONFIRM_REGISTRO_SI)),
    ]);

    expect(store.registrar).toHaveBeenCalledTimes(1);
    const registradas = results.filter((result) => result.sent.some((effect) => effect.text?.includes("*000123*")));
    expect(registradas).toHaveLength(1);
    expect(store.sessions.get(FROM)?.state).not.toBe(SessionState.INCIDENCIA_SUBMIT_PENDING);
  });
});

describe("a tap that is still current", () => {
  it("is processed, marked as read before the first reply, and consumes the message", async () => {
    store.sessions.set(FROM, confirming());
    const { hooks, calls } = recordingHooks();

    const result = await runTurnUnlocked(FROM, tap(IncidenciaButtonId.CONFIRM_REGISTRO_SI, RESUMEN_WAMID), hooks);

    expect(store.registrar).toHaveBeenCalledTimes(1);
    expect(result.sent.length).toBeGreaterThan(0);
    expect(calls[0]).toBe("accepted");
    expect(calls.filter((call) => call.startsWith("send:"))).toEqual([expect.stringContaining("*000123*")]);
    expect(staleLines()).toEqual([]);
  });

  it("remembers the new interactive message the turn sends, and it becomes the current one", async () => {
    store.sessions.set(FROM, confirming({ [SlotKey.INTERACTIVE_MESSAGE_ID]: RESUMEN_WAMID }));
    const { hooks } = recordingHooks();

    await runTurnUnlocked(FROM, { from: FROM, type: InboundEventType.TEXT, text: "no entiendo" }, hooks);

    const saved = store.sessions.get(FROM);
    expect(saved?.state).toBe(SessionState.INCIDENCIA_CONFIRM_REGISTRO);
    expect(saved?.slots[SlotKey.INTERACTIVE_MESSAGE_ID]).toMatch(/^wamid\.out\./);
    expect(saved?.slots[SlotKey.INTERACTIVE_MESSAGE_CONSUMED]).toBeUndefined();
  });
});

describe("failing open", () => {
  it("a tap without the id of the message it answers is processed as today", async () => {
    store.sessions.set(FROM, confirming({ [SlotKey.INTERACTIVE_MESSAGE_ID]: RESUMEN_WAMID, [SlotKey.INTERACTIVE_MESSAGE_CONSUMED]: true }));

    await runTurnUnlocked(FROM, tap(IncidenciaButtonId.CONFIRM_REGISTRO_SI), recordingHooks().hooks);

    expect(store.registrar).toHaveBeenCalledTimes(1);
    expect(staleLines()).toEqual([]);
  });

  it("a tap on a conversation with no remembered message is processed as today", async () => {
    store.sessions.set(FROM, confirming({}));

    await runTurnUnlocked(FROM, tap(IncidenciaButtonId.CONFIRM_REGISTRO_SI, "wamid.cualquiera"), recordingHooks().hooks);

    expect(store.registrar).toHaveBeenCalledTimes(1);
    expect(staleLines()).toEqual([]);
  });
});

describe("typing a button id", () => {
  it("is not a tap: writing the 'Registrar' id does not register the incidencia", async () => {
    store.sessions.set(FROM, confirming({}));

    await runTurnUnlocked(FROM, { from: FROM, type: InboundEventType.TEXT, text: IncidenciaButtonId.CONFIRM_REGISTRO_SI });

    expect(store.registrar).not.toHaveBeenCalled();
    expect(store.sessions.get(FROM)?.state).toBe(SessionState.INCIDENCIA_CONFIRM_REGISTRO);
  });
});

describe("a turn that changes the state consumes the remembered message", () => {
  it("typing 'sí' at the confirmation registers, and a later tap on 'Cancelar' of that summary is ignored", async () => {
    store.sessions.set(FROM, confirming());
    await runTurnUnlocked(FROM, { from: FROM, type: InboundEventType.TEXT, text: "sí" }, recordingHooks().hooks);
    expect(store.registrar).toHaveBeenCalledTimes(1);
    const afterRegister = structuredClone(store.sessions.get(FROM));
    expect(afterRegister?.state).toBe(SessionState.INCIDENCIA_CONFIRMED);
    expect(afterRegister?.slots[SlotKey.INTERACTIVE_MESSAGE_CONSUMED]).toBe(true);

    const { hooks, calls } = recordingHooks();
    const result = await runTurnUnlocked(FROM, tap(IncidenciaButtonId.CONFIRM_REGISTRO_NO, RESUMEN_WAMID), hooks);

    expect(result.sent).toEqual([]);
    expect(calls).toEqual([]);
    expect(store.sessions.get(FROM)).toEqual(afterRegister);
    expect(staleLines()).toHaveLength(1);
  });

  it("an unrecognized text that leaves the state unchanged keeps the current buttons valid", async () => {
    const resumen = { [SlotKey.INTERACTIVE_MESSAGE_ID]: RESUMEN_WAMID };
    store.sessions.set(FROM, confirming(resumen));
    const typed = await runTurnUnlocked(FROM, { from: FROM, type: InboundEventType.TEXT, text: "no entendí" });
    expect(typed.session.state).toBe(SessionState.INCIDENCIA_CONFIRM_REGISTRO);
    expect(store.sessions.get(FROM)?.slots[SlotKey.INTERACTIVE_MESSAGE_CONSUMED]).toBeUndefined();

    const { hooks, calls } = recordingHooks();
    await runTurnUnlocked(FROM, tap(IncidenciaButtonId.CONFIRM_REGISTRO_SI, RESUMEN_WAMID), hooks);

    expect(store.registrar).toHaveBeenCalledTimes(1);
    expect(calls[0]).toBe("accepted");
    expect(staleLines()).toEqual([]);
  });

  it("a state change that sends a new interactive message leaves that new one current and unconsumed", async () => {
    store.sessions.set(FROM, {
      state: SessionState.INCIDENCIA_IDENTITY_CHOICE,
      slots: {
        [SlotKey.INTERACTIVE_MESSAGE_ID]: "wamid.identidad",
        [SlotKey.INCIDENCIA_BORRADOR]: "Me cobraron sin recibo en la ventanilla de admisión.",
      },
      counters: {},
    });

    await runTurnUnlocked(FROM, tap(IncidenciaButtonId.ANONIMO, "wamid.identidad"), recordingHooks().hooks);

    const saved = store.sessions.get(FROM);
    expect(saved?.state).not.toBe(SessionState.INCIDENCIA_IDENTITY_CHOICE);
    expect(saved?.slots[SlotKey.INTERACTIVE_MESSAGE_ID]).toMatch(/^wamid\.out\./);
    expect(saved?.slots[SlotKey.INTERACTIVE_MESSAGE_CONSUMED]).toBeUndefined();
  });
});

describe("a tap on the main menu list", () => {
  const tapRow = (listId: string, replyTo?: string): InboundEvent => ({
    from: FROM,
    type: InboundEventType.LIST,
    listId,
    ...(replyTo ? { replyTo } : {}),
  });

  async function showMenu(): Promise<string | undefined> {
    const shown = await runTurnUnlocked(FROM, { from: FROM, type: InboundEventType.TEXT, text: "hola" }, recordingHooks().hooks);
    const list = shown.sent.find((effect) => effect.kind === "send_interactive_list");
    expect(list?.kind === "send_interactive_list" && list.rows.map((row) => row.id)).toContain(MenuChoice.CONSULTAR_REFERENCIA);
    const menuId = store.sessions.get(FROM)?.slots[SlotKey.INTERACTIVE_MESSAGE_ID];
    return typeof menuId === "string" ? menuId : undefined;
  }

  it("the referencia row of the menu just sent is accepted and asks to log in for the referencias", async () => {
    const menuId = await showMenu();
    expect(menuId).toMatch(/^wamid\.out\./);
    const { hooks, calls } = recordingHooks();

    const result = await runTurnUnlocked(FROM, tapRow(MenuChoice.CONSULTAR_REFERENCIA, menuId), hooks);

    expect(staleLines()).toEqual([]);
    expect(calls[0]).toBe("accepted");
    expect(result.sent).toEqual([{ kind: "send_text", text: REFERENCIA_LOGIN_REQUIRED_TEXT }]);
    expect(store.sessions.get(FROM)?.state).toBe(SessionState.CITA_AWAITING_DNI);
    expect(store.sessions.get(FROM)?.slots[SlotKey.POST_LOGIN_FLOW]).toBe(PostLoginFlow.REFERENCIAS);
  });

  it("the referencia row of an older menu is ignored once a newer menu was sent", async () => {
    const menuId = await showMenu();
    const before = structuredClone(store.sessions.get(FROM));
    const { hooks, calls } = recordingHooks();

    const result = await runTurnUnlocked(FROM, tapRow(MenuChoice.CONSULTAR_REFERENCIA, "wamid.menu-viejo"), hooks);

    expect(menuId).not.toBe("wamid.menu-viejo");
    expect(result.sent).toEqual([]);
    expect(calls).toEqual([]);
    expect(store.sessions.get(FROM)).toEqual(before);
    expect(staleLines()).toHaveLength(1);
  });
});

describe("a tap on the buttons of the referencia choice", () => {
  async function showChoice(): Promise<string | undefined> {
    const shown = await runTurnUnlocked(
      FROM,
      { from: FROM, type: InboundEventType.TEXT, text: "¿Ya aceptaron mi referencia?" },
      recordingHooks().hooks,
    );
    expect(shown.sent.find((effect) => effect.kind === "send_buttons")).toBeDefined();
    const choiceId = store.sessions.get(FROM)?.slots[SlotKey.INTERACTIVE_MESSAGE_ID];
    return typeof choiceId === "string" ? choiceId : undefined;
  }

  it("«Consultar referencia» on the choice just sent is accepted and asks to log in for the referencias", async () => {
    const choiceId = await showChoice();
    expect(choiceId).toMatch(/^wamid\.out\./);
    const { hooks, calls } = recordingHooks();

    const result = await runTurnUnlocked(FROM, tap(ReferenciaChoiceButtonId.CONSULTAR_REFERENCIA, choiceId), hooks);

    expect(staleLines()).toEqual([]);
    expect(calls[0]).toBe("accepted");
    expect(result.sent).toEqual([{ kind: "send_text", text: REFERENCIA_LOGIN_REQUIRED_TEXT }]);
    expect(store.sessions.get(FROM)?.slots[SlotKey.POST_LOGIN_FLOW]).toBe(PostLoginFlow.REFERENCIAS);
  });

  it("«Agendar cita» of an older choice is ignored once a newer one was sent", async () => {
    await showChoice();
    const before = structuredClone(store.sessions.get(FROM));
    const { hooks, calls } = recordingHooks();

    const result = await runTurnUnlocked(FROM, tap(ReferenciaChoiceButtonId.AGENDAR_CITA, "wamid.eleccion-vieja"), hooks);

    expect(result.sent).toEqual([]);
    expect(calls).toEqual([]);
    expect(store.sessions.get(FROM)).toEqual(before);
    expect(staleLines()).toHaveLength(1);
  });

  it("a second tap on the same choice, after the first one was accepted, is ignored", async () => {
    const choiceId = await showChoice();
    await runTurnUnlocked(FROM, tap(ReferenciaChoiceButtonId.AGENDAR_CITA, choiceId), recordingHooks().hooks);
    const afterFirst = structuredClone(store.sessions.get(FROM));
    expect(afterFirst?.state).toBe(SessionState.CITA_AWAITING_DNI);

    const result = await runTurnUnlocked(FROM, tap(ReferenciaChoiceButtonId.CONSULTAR_REFERENCIA, choiceId), recordingHooks().hooks);

    expect(result.sent).toEqual([]);
    expect(store.sessions.get(FROM)).toEqual(afterFirst);
    expect(staleLines()).toHaveLength(1);
  });
});
