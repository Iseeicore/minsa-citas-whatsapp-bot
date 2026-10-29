import { describe, expect, it } from "vitest";
import { handle } from "@/lib/fsm/core/handlers";
import { isQueryEffect } from "@/lib/fsm/core/handlers-shared";
import { handleFirstContact } from "@/lib/fsm/routing/first-contact";
import { detectOutOfScope } from "@/lib/fsm/flows/out-of-scope/out-of-scope";
import { REFERENCIA_LOGIN_REQUIRED_TEXT } from "@/lib/constants/textos/referencia";
import { OOS_MESSAGES } from "@/lib/constants/textos/fuera-de-alcance";
import { FALLBACK_TEXT } from "@/lib/constants/textos/comunes";
import { RESPECT_REMINDER_TEXT } from "@/lib/constants/textos/seguridad";
import { IN_FLOW_MAX_CHARS } from "@/lib/constants/limits/out-of-scope";
import type { HandlerResult, InboundEvent, SendEffect, Session, SessionChannel } from "@/lib/fsm/core/types";
import { ReferenciaChoiceButtonId } from "@/lib/enums/referencia-choice-button-id";
import { OosCategory } from "@/lib/enums/oos-category";
import { PostLoginFlow } from "@/lib/enums/post-login-flow";
import { SessionChannel as Channel } from "@/lib/enums/session-channel";
import { SessionState } from "@/lib/enums/session-state";
import { SlotKey } from "@/lib/enums/slot-key";

const FROM = "sandbox-referencia-choice";
const CHANNELS = [Channel.WHATSAPP, Channel.WEB];

const CHOICE = {
  kind: "send_buttons",
  text: "Gestión de Referencias Médicas:\n\nPara una cita en hospital o instituto, tu centro de origen debe emitir la Hoja de Referencia (REFCON).\n\n¿Qué deseas hacer?",
  buttons: [
    { id: ReferenciaChoiceButtonId.CONSULTAR_REFERENCIA, title: "Cita con referencia" },
    { id: ReferenciaChoiceButtonId.AGENDAR_CITA, title: "Agendar cita" },
  ],
};

const typed = (value: string, channel: SessionChannel = Channel.WHATSAPP): InboundEvent => ({
  from: FROM,
  type: "text",
  text: value,
  channel,
});
const tapped = (id: string, channel: SessionChannel = Channel.WHATSAPP): InboundEvent => ({
  from: FROM,
  type: "button",
  listId: id,
  channel,
});
const mainMenu = (slots: Session["slots"] = {}): Session => ({ state: SessionState.MAIN_MENU, slots, counters: {} });
const choosing = (slots: Session["slots"] = {}): Session => ({ state: SessionState.MAIN_MENU_REFERENCIA_CHOICE, slots, counters: {} });

const sent = (result: HandlerResult): SendEffect[] => result.effects.filter((effect): effect is SendEffect => !isQueryEffect(effect));
const texts = (result: HandlerResult): string[] => sent(result).flatMap((effect) => (effect.kind === "send_text" ? [effect.text] : []));

function expectChoice(result: HandlerResult) {
  expect(sent(result)).toEqual([CHOICE]);
  expect(result.effects.some(isQueryEffect)).toBe(false);
  expect(result.session.state).toBe(SessionState.MAIN_MENU_REFERENCIA_CHOICE);
  expect(result.notes).toContainEqual(expect.objectContaining({ kind: "out_of_scope", detail: { category: OosCategory.OOS_03 } }));
}

function expectLoginForReferencias(result: HandlerResult) {
  expect(result.session.state).toBe(SessionState.CITA_AWAITING_DNI);
  expect(result.session.slots[SlotKey.POST_LOGIN_FLOW]).toBe(PostLoginFlow.REFERENCIAS);
  expect(texts(result)).toEqual([REFERENCIA_LOGIN_REQUIRED_TEXT]);
}

function expectCitaStart(result: HandlerResult, channel: SessionChannel = Channel.WHATSAPP) {
  const viaKeyword = handle(mainMenu(), typed("CITAS", channel));

  expect(result.session).toEqual(viaKeyword.session);
  expect(result.effects).toEqual(viaKeyword.effects);
  expect(result.session.state).toBe(SessionState.CITA_AWAITING_DNI);
  expect(result.session.slots[SlotKey.POST_LOGIN_FLOW]).toBeUndefined();
}

describe("a message about the referencia that is not a plain request gets the two-button choice", () => {
  it.each(CHANNELS)("first contact with «¿Ya aceptaron mi referencia?» (%s)", (channel) => {
    const result = handleFirstContact("¿Ya aceptaron mi referencia?", channel);

    expectChoice(result);
    expect(result.notes).toContainEqual({ kind: "first_contact", detail: { route: "out_of_scope" } });
  });

  it.each(CHANNELS)("main menu with «¿Ya aceptaron mi referencia?» (%s)", (channel) => {
    expectChoice(handle(mainMenu(), typed("¿Ya aceptaron mi referencia?", channel)));
  });

  it.each(CHANNELS)("«quiero una cita por referencia» at first contact and in the menu (%s)", (channel) => {
    expectChoice(handleFirstContact("quiero una cita por referencia", channel));
    expectChoice(handle(mainMenu(), typed("quiero una cita por referencia", channel)));
  });

  it("the old long text of OOS-03 is gone, while the category is still detected", () => {
    expect(Object.keys(OOS_MESSAGES)).not.toContain(OosCategory.OOS_03);
    expect(detectOutOfScope("¿Ya aceptaron mi referencia?")).toBe(OosCategory.OOS_03);
  });

  it("keeps what the menu already knew", () => {
    const result = handle(mainMenu({ [SlotKey.NOMBRE]: "kept" }), typed("¿Ya aceptaron mi referencia?"));

    expect(result.session.slots).toEqual({ [SlotKey.NOMBRE]: "kept" });
  });
});

describe("what does not reach the choice", () => {
  it("«punto de referencia» (an address) is not OOS-03 and never shows the choice", () => {
    const message = "vivo cerca del parque, punto de referencia el mercado";

    expect(detectOutOfScope(message)).not.toBe(OosCategory.OOS_03);
    expect(sent(handleFirstContact(message, Channel.WHATSAPP))).not.toContainEqual(CHOICE);
    expect(sent(handle(mainMenu(), typed(message)))).not.toContainEqual(CHOICE);
  });

  it("an emergency that also names the referencia gets the emergency message", () => {
    const message = "mi mamá no puede respirar, ¿ya aceptaron mi referencia?";

    expect(texts(handleFirstContact(message, Channel.WHATSAPP))).toEqual([OOS_MESSAGES[OosCategory.OOS_01]]);
    expect(texts(handle(mainMenu(), typed(message)))).toEqual([OOS_MESSAGES[OosCategory.OOS_01]]);
  });

  it("a plain request of the referencia still goes straight to the login", () => {
    expectLoginForReferencias(handle(mainMenu(), typed("quiero consultar mi referencia")));
  });
});

describe("answering the choice", () => {
  it.each(CHANNELS)("tapping «Consultar referencia» asks to log in for the referencias (%s)", (channel) => {
    expectLoginForReferencias(handle(choosing(), tapped(ReferenciaChoiceButtonId.CONSULTAR_REFERENCIA, channel)));
  });

  it.each(CHANNELS)("tapping «Agendar cita» starts the cita like the CITAS keyword (%s)", (channel) => {
    expectCitaStart(handle(choosing(), tapped(ReferenciaChoiceButtonId.AGENDAR_CITA, channel)), channel);
  });

  it.each([
    "1",
    "uno",
    "Cita con referencia",
    "consultar referencia",
    "¡CONSULTAR  Referencia!",
    "referencia",
    "REFERENCIA",
    "referencias",
  ])("typing %j follows the first button: consultar referencia", (message) => {
    expectLoginForReferencias(handle(choosing(), typed(message)));
  });

  it.each(["2", "dos", "Agendar cita", "agendar CITA", "Agendar cita.", "CITAS", "cita"])(
    "typing %j follows the second button: agendar cita",
    (message) => {
      expectCitaStart(handle(choosing(), typed(message)));
    },
  );

  it("the referencia login does not keep the opening message", () => {
    const result = handle(choosing({ [SlotKey.INITIAL_MESSAGE_TEXT]: "hola" }), typed("1"));

    expect(result.session.slots[SlotKey.INITIAL_MESSAGE_TEXT]).toBeUndefined();
  });

  it.each([
    "zzzz",
    "no sé",
    "3",
    "no quiero cita",
    "no quiero consultar nada",
    "consultar cita mañana",
    "agendar",
    "consultar",
    "quiero agendar una cita",
  ])("anything else (%j) shows the same buttons again with the notice", (message) => {
    const result = handle(choosing(), typed(message));

    expect(sent(result)).toEqual([{ kind: "send_text", text: FALLBACK_TEXT }, CHOICE]);
    expect(result.session.state).toBe(SessionState.MAIN_MENU_REFERENCIA_CHOICE);
  });

  it("a tap on a button of another message shows the same buttons again with the notice", () => {
    const result = handle(choosing(), tapped("otro_boton"));

    expect(sent(result)).toEqual([{ kind: "send_text", text: FALLBACK_TEXT }, CHOICE]);
    expect(result.session.state).toBe(SessionState.MAIN_MENU_REFERENCIA_CHOICE);
  });

  it("an emergency while choosing gets the emergency message, even a long one, as in the menu", () => {
    const message =
      "mi papá está inconsciente y no reacciona desde hace un rato, ya llamé a varios números pero nadie contesta y no sé qué más hacer ahora";
    expect(message.length).toBeGreaterThan(IN_FLOW_MAX_CHARS);

    const result = handle(choosing(), typed(message));

    expect(texts(result)).toEqual([OOS_MESSAGES[OosCategory.OOS_01]]);
    expect(result.session.state).toBe(SessionState.EMERGENCY_CLOSED);
  });

  it("an insult while choosing gets the respect reminder and the same buttons", () => {
    const result = handle(choosing(), typed("eres un idiota"));

    expect(sent(result)).toEqual([{ kind: "send_text", text: RESPECT_REMINDER_TEXT }, CHOICE]);
    expect(result.session.state).toBe(SessionState.MAIN_MENU_REFERENCIA_CHOICE);
  });
});
