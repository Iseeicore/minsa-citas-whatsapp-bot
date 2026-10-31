import { describe, expect, it } from "vitest";
import { handle } from "@/lib/fsm/core/handlers";
import { findButtonReprompt } from "@/lib/fsm/flows/shared/button-reprompts";
import type { Session } from "@/lib/fsm/core/types";
import { RESPECT_REMINDER_TEXT } from "@/lib/constants/textos/seguridad";
import { ExitButtonId } from "@/lib/enums/exit-button-id";
import { SessionState } from "@/lib/enums/session-state";
import { SlotKey } from "@/lib/enums/slot-key";
import { sent, tap, text, texts } from "@/tests/support/fsm-events";

const CONFIRMING: Session = {
  state: SessionState.CITA_AWAITING_ESTABLECIMIENTO_CONFIRM,
  slots: {
    [SlotKey.CITA_ESTABLECIMIENTO_PROPUESTO]: "0002",
    [SlotKey.CITA_ESTABLECIMIENTO_PROPUESTO_NOMBRE]: "Centro de Salud San Fernando",
  },
  counters: {},
};

describe("findButtonReprompt", () => {
  it("gives the lexical guard and the exit confirmation the same question to repeat", () => {
    const reprompt = findButtonReprompt(CONFIRMING.state);
    expect(reprompt).toBeDefined();
    const question = reprompt ? sent(reprompt(CONFIRMING)) : [];

    const insulted = handle(CONFIRMING, text("cojudos"));
    expect(texts(insulted)).toContain(RESPECT_REMINDER_TEXT);
    expect(sent(insulted).at(-1)).toEqual(question.at(-1));

    const stayed = handle(handle(CONFIRMING, text("salir")).session, tap(ExitButtonId.NO));
    expect(sent(stayed)).toEqual(question);

    expect(findButtonReprompt(SessionState.MAIN_MENU_REFERENCIA_CHOICE)).toBeDefined();
    expect(findButtonReprompt(SessionState.CITA_AWAITING_DNI)).toBeUndefined();
  });
});
