import { describe, expect, it } from "vitest";
import { handle } from "@/lib/fsm/core/handlers";
import { isQueryEffect } from "@/lib/fsm/core/handlers-shared";
import type { HandlerResult, InboundEvent, QueryResultEvent, SendEffect, Session } from "@/lib/fsm/core/types";
import { beginReverification } from "@/lib/fsm/flows/cita/steps/identity/reverification";
import { handleFirstContact } from "@/lib/fsm/routing/first-contact";
import { handleAwaitingFlowStart } from "@/lib/fsm/routing/main-menu";
import { handleAwaitingReauth } from "@/lib/fsm/session/session-reauth";
import { RESPECT_REMINDER_TEXT } from "@/lib/security/lexical-guard";
import { MenuChoice } from "@/lib/enums/menu-choice";
import { SessionState } from "@/lib/enums/session-state";
import { SlotKey } from "@/lib/enums/slot-key";

const FROM = "sandbox-documento-prompts";
const text = (value: string): InboundEvent => ({ from: FROM, type: "text", text: value });
const tap = (id: string): InboundEvent => ({ from: FROM, type: "button", listId: id });

const sent = (result: HandlerResult): SendEffect[] =>
  result.effects.filter((effect): effect is SendEffect => !isQueryEffect(effect));
const firstText = (result: HandlerResult): string => {
  const [effect] = sent(result);
  return effect.kind === "send_text" ? effect.text : "";
};

const AMOUNT_OR_TYPE = /d[ií]gitos|DNI/i;

describe("toda petición del documento dice solo «número de documento»", () => {
  it("primer contacto con «1»", () => {
    const reply = firstText(handleFirstContact("1", "whatsapp"));

    expect(reply).toBe("¡Hola! Vamos a agendar tu cita. Para comenzar, por favor indícanos tu número de documento:");
    expect(reply).not.toMatch(AMOUNT_OR_TYPE);
  });

  it("primer contacto con una petición de cita", () => {
    const reply = firstText(handleFirstContact("quiero una cita de odontología", "whatsapp"));

    expect(reply).toBe("¡Hola! Te ayudaremos a agendar tu cita de Odontología. Para comenzar, por favor indícanos tu número de documento:");
    expect(reply).not.toMatch(AMOUNT_OR_TYPE);
  });

  it("menú principal: elegir agendar cita", () => {
    const session: Session = {
      state: SessionState.AWAITING_FLOW_START,
      slots: { [SlotKey.MENU_CHOICE]: MenuChoice.AGENDAR_CITA },
      counters: {},
    };
    const reply = firstText(handleAwaitingFlowStart(session));

    expect(reply).toBe("Ingresa tu número de documento.");
    expect(reply).not.toMatch(AMOUNT_OR_TYPE);
  });

  it("menú principal: la IA entiende que quiere una cita", () => {
    const pending: Session = { state: "main_menu_intent_pending", slots: { [SlotKey.INITIAL_MESSAGE_TEXT]: "x" }, counters: {} };
    const answer: QueryResultEvent = {
      from: FROM,
      type: "query_result",
      queryKind: "analyze_main_menu_intent",
      result: { intent: "cita" },
    };
    const reply = firstText(handle(pending, answer));

    expect(reply).toBe(
      "¡Entendido! Quieres agendar una cita médica. Antes de continuar necesito verificar tu identidad — ingresa tu número de documento.",
    );
    expect(reply).not.toMatch(AMOUNT_OR_TYPE);
  });

  it("recordatorio de respeto y continuar con la cita", () => {
    const reply = firstText(handle({ state: "main_menu", slots: {}, counters: {} }, text("cojudos denme una cita")));

    expect(reply).toBe(`${RESPECT_REMINDER_TEXT} Continuemos con tu cita: ingresa tu número de documento.`);
    expect(reply).not.toMatch(AMOUNT_OR_TYPE);
  });

  it("reautenticación sin documento guardado", () => {
    const session: Session = { state: "cita_awaiting_reauth", slots: {}, counters: {} };
    const reply = firstText(handleAwaitingReauth(session, tap("cita_reauth_si")));

    expect(reply).toBe("Para enviarte un nuevo código, ingresa tu número de documento.");
    expect(reply).not.toMatch(AMOUNT_OR_TYPE);
  });

  it("reverificación por inactividad", () => {
    const reply = firstText(beginReverification({ state: "cita_hora_pending", slots: {}, counters: {} }, "cita_hora_pending"));

    expect(reply).toBe(
      "Tu verificación anterior expiró por inactividad. No te preocupes, no perdimos los datos de tu cita — ingresa tu número de documento para continuar justo donde quedaste.",
    );
    expect(reply).not.toMatch(AMOUNT_OR_TYPE);
  });
});
