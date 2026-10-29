import { describe, expect, it } from "vitest";
import { handle } from "@/lib/fsm/core/handlers";
import { isQueryEffect } from "@/lib/fsm/core/handlers-shared";
import { serializeOffered } from "@/lib/fsm/parsing/selection/selection-matchers";
import type { HandlerResult, InboundEvent, SendEffect, Session } from "@/lib/fsm/core/types";
import type { ReferenciaItem } from "@/lib/integrations/minsa/types";
import {
  CITA_ABANDONED_TEXT,
  EXIT_BUTTONS,
  EXIT_QUESTION_TEXT,
  REFERENCIA_ABANDONED_TEXT,
  REFERENCIA_EXIT_QUESTION_TEXT,
} from "@/lib/constants/textos/cita-salida";
import { REFERENCIA_CONFIRM_BUTTONS, REFERENCIA_CONFIRM_QUESTION_TEXT } from "@/lib/constants/textos/cita-reserva";
import { REFERENCIA_CITA_OFFER_BUTTONS, REFERENCIA_CITA_OFFER_QUESTION_TEXT } from "@/lib/constants/textos/referencia";
import { RESPECT_REMINDER_TEXT } from "@/lib/constants/textos/seguridad";
import { ExitButtonId } from "@/lib/enums/exit-button-id";
import { PostLoginFlow } from "@/lib/enums/post-login-flow";
import { ReferenciaConfirmButtonId } from "@/lib/enums/referencia-confirm-button-id";
import { SessionState } from "@/lib/enums/session-state";
import { SlotKey } from "@/lib/enums/slot-key";
import { CITA_REFERENCIA_CHANGE_BUTTON, consultaReferenciasListText } from "@/lib/constants/textos/cita-referencia";

const FROM = "sandbox-referencia-exit";
const INSULT = "cojudos";
const EXIT_WORD = "quiero salir";

const text = (value: string): InboundEvent => ({ from: FROM, type: "text", text: value });
const tap = (id: string): InboundEvent => ({ from: FROM, type: "button", listId: id });
const sent = (result: HandlerResult): SendEffect[] => result.effects.filter((effect): effect is SendEffect => !isQueryEffect(effect));

const REFERENCIA: ReferenciaItem = {
  idReferencia: "1364486",
  numero: "00123",
  fechaInicio: "24/07/2024 23:03",
  ipressOrigen: "SAN FERNANDO",
  ipressDestino: "HOSPITAL MARIA AUXILIADORA",
  upsOrigen: "MEDICINA GENERAL",
  upsDestino: "GASTROENTEROLOGIA",
  codigoIpressDestino: "5987",
  codigoUpsDestino: "222800",
  estado: 5,
};

const OFFERED = serializeOffered({
  text: consultaReferenciasListText(["PACIENTE RECIBIDO"]),
  rows: [{ id: REFERENCIA.idReferencia, title: REFERENCIA.ipressDestino, description: "24/07/2024 11:03 PM · SAN FERNANDO" }],
});

const base = (state: Session["state"], slots: Session["slots"] = {}): Session => ({
  state,
  slots: {
    [SlotKey.CITA_BEARER]: "token-real",
    [SlotKey.CITA_DNI]: "12345678",
    [SlotKey.POST_LOGIN_FLOW]: PostLoginFlow.REFERENCIAS,
    [SlotKey.CITA_REFERENCIAS_DATA]: JSON.stringify([REFERENCIA]),
    ...slots,
  },
  counters: {},
});

const selectState = () => base(SessionState.CITA_AWAITING_REFERENCIA_SELECT, { [SlotKey.CITA_OFFERED]: OFFERED });
const confirmState = () =>
  base(SessionState.CITA_AWAITING_REFERENCIA_CONFIRM, { [SlotKey.CITA_REFERENCIA_SELECCIONADA_ID]: REFERENCIA.idReferencia });
const offerState = () => base(SessionState.REFERENCIA_AWAITING_CITA_OFFER);

const STATES: ReadonlyArray<readonly [string, () => Session]> = [
  ["the referencias list", selectState],
  ["the referencia confirmation", confirmState],
  ["the cita offer", offerState],
];

describe("leaving from the referencias steps", () => {
  it.each(STATES)("in %s a wish to leave asks for confirmation first", (_label, make) => {
    const session = make();
    const result = handle(session, text(EXIT_WORD));

    expect(result.session.state).toBe(SessionState.CITA_AWAITING_EXIT_CONFIRM);
    expect(result.session.slots[SlotKey.CITA_EXIT_RESUME_STATE]).toBe(session.state);
    expect(sent(result)).toEqual([{ kind: "send_buttons", text: REFERENCIA_EXIT_QUESTION_TEXT, buttons: EXIT_BUTTONS }]);
  });

  it.each(STATES)("in %s confirming the exit closes the session and clears the purpose", (_label, make) => {
    const asked = handle(make(), text(EXIT_WORD));
    const result = handle(asked.session, tap(ExitButtonId.YES));

    expect(result.session.state).toBe(SessionState.CITA_ABANDONED);
    expect(result.session.slots).toEqual({});
    expect(result.session.slots[SlotKey.POST_LOGIN_FLOW]).toBeUndefined();
    expect(sent(result)).toEqual([{ kind: "send_text", text: REFERENCIA_ABANDONED_TEXT }]);
  });

  it("declining the exit in the list shows the list again", () => {
    const asked = handle(selectState(), text(EXIT_WORD));
    const result = handle(asked.session, tap(ExitButtonId.NO));

    expect(result.session.state).toBe(SessionState.CITA_AWAITING_REFERENCIA_SELECT);
    expect(result.session.slots[SlotKey.CITA_EXIT_RESUME_STATE]).toBeUndefined();
    expect(result.session.slots[SlotKey.POST_LOGIN_FLOW]).toBe(PostLoginFlow.REFERENCIAS);
    expect(sent(result).some((effect) => effect.kind === "send_interactive_list")).toBe(true);
  });

  it("declining the exit in the confirmation asks it again with its buttons", () => {
    const asked = handle(confirmState(), text(EXIT_WORD));
    const result = handle(asked.session, tap(ExitButtonId.NO));

    expect(result.session.state).toBe(SessionState.CITA_AWAITING_REFERENCIA_CONFIRM);
    expect(result.session.slots[SlotKey.CITA_REFERENCIA_SELECCIONADA_ID]).toBe(REFERENCIA.idReferencia);
    expect(sent(result).at(-1)).toEqual({
      kind: "send_buttons",
      text: REFERENCIA_CONFIRM_QUESTION_TEXT,
      buttons: [...REFERENCIA_CONFIRM_BUTTONS, CITA_REFERENCIA_CHANGE_BUTTON],
    });
  });

  it("declining the exit in the cita offer asks it again with its buttons", () => {
    const asked = handle(offerState(), text(EXIT_WORD));
    const result = handle(asked.session, tap(ExitButtonId.NO));

    expect(result.session.state).toBe(SessionState.REFERENCIA_AWAITING_CITA_OFFER);
    expect(sent(result)).toEqual([
      { kind: "send_buttons", text: REFERENCIA_CITA_OFFER_QUESTION_TEXT, buttons: REFERENCIA_CITA_OFFER_BUTTONS },
    ]);
  });

  it("the exit texts speak of the referencia only under the referencias purpose", () => {
    const login = base(SessionState.CITA_AWAITING_DNI);
    const asked = handle(login, text(EXIT_WORD));
    expect(sent(asked)).toEqual([{ kind: "send_buttons", text: REFERENCIA_EXIT_QUESTION_TEXT, buttons: EXIT_BUTTONS }]);

    const plain = base(SessionState.CITA_AWAITING_DNI);
    delete plain.slots[SlotKey.POST_LOGIN_FLOW];
    const plainAsked = handle(plain, text(EXIT_WORD));
    expect(sent(plainAsked)).toEqual([{ kind: "send_buttons", text: EXIT_QUESTION_TEXT, buttons: EXIT_BUTTONS }]);
    expect(sent(handle(plainAsked.session, tap(ExitButtonId.YES)))).toEqual([{ kind: "send_text", text: CITA_ABANDONED_TEXT }]);
  });

  it("an unclear answer to the exit question asks it again with the referencias text", () => {
    const asked = handle(selectState(), text(EXIT_WORD));
    const result = handle(asked.session, text("mmm"));

    expect(sent(result)).toEqual([{ kind: "send_buttons", text: REFERENCIA_EXIT_QUESTION_TEXT, buttons: EXIT_BUTTONS }]);
  });

  it("«No, ver otra» still goes back to the list and keeps the purpose", () => {
    const tapped = handle(confirmState(), tap(ReferenciaConfirmButtonId.NO));
    const typed = handle(confirmState(), text("no"));

    for (const result of [tapped, typed]) {
      expect(result.session.state).toBe(SessionState.CITA_AWAITING_REFERENCIA_SELECT);
      expect(result.session.slots[SlotKey.POST_LOGIN_FLOW]).toBe(PostLoginFlow.REFERENCIAS);
    }
  });
});

describe("the lexical guard in the referencias steps", () => {
  it("an insult in the list reminds respect and shows the list again", () => {
    const result = handle(selectState(), text(INSULT));

    expect(result.session.state).toBe(SessionState.CITA_AWAITING_REFERENCIA_SELECT);
    expect(sent(result)[0]).toEqual({ kind: "send_text", text: RESPECT_REMINDER_TEXT });
    expect(sent(result).some((effect) => effect.kind === "send_interactive_list")).toBe(true);
  });

  it("an insult in the confirmation reminds respect and asks it again", () => {
    const result = handle(confirmState(), text(INSULT));

    expect(result.session.state).toBe(SessionState.CITA_AWAITING_REFERENCIA_CONFIRM);
    expect(sent(result)[0]).toEqual({ kind: "send_text", text: RESPECT_REMINDER_TEXT });
    expect(sent(result).at(-1)).toEqual({
      kind: "send_buttons",
      text: REFERENCIA_CONFIRM_QUESTION_TEXT,
      buttons: [...REFERENCIA_CONFIRM_BUTTONS, CITA_REFERENCIA_CHANGE_BUTTON],
    });
  });

  it("an insult in the cita offer reminds respect and asks it again", () => {
    const result = handle(offerState(), text(INSULT));

    expect(result.session.state).toBe(SessionState.REFERENCIA_AWAITING_CITA_OFFER);
    expect(sent(result)[0]).toEqual({ kind: "send_text", text: RESPECT_REMINDER_TEXT });
    expect(sent(result).at(-1)).toEqual({
      kind: "send_buttons",
      text: REFERENCIA_CITA_OFFER_QUESTION_TEXT,
      buttons: REFERENCIA_CITA_OFFER_BUTTONS,
    });
  });
});
