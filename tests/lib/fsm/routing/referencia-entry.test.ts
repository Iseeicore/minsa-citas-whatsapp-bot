import { afterEach, describe, expect, it, vi } from "vitest";
import { handle } from "@/lib/fsm/core/handlers";
import { isQueryEffect } from "@/lib/fsm/core/handlers-shared";
import { handleFirstContact } from "@/lib/fsm/routing/first-contact";
import { isReferenciaKeyword } from "@/lib/fsm/routing/menu-shortcuts";
import { buildMenuEffect } from "@/lib/fsm/routing/flow-entry";
import { handleMainMenuIntentPending } from "@/lib/fsm/routing/main-menu";
import {
  REFERENCIA_CHOICE_BUTTONS,
  REFERENCIA_CHOICE_QUESTION_TEXT,
  REFERENCIA_LOGIN_REQUIRED_TEXT,
} from "@/lib/constants/textos/referencia";
import { OUT_OF_SCOPE_REQUEST_TEXT, SERVICE_DISABLED_TEXT } from "@/lib/constants/textos/menu";
import type { HandlerResult, InboundEvent, QueryResultEvent, SendEffect, Session, SessionChannel } from "@/lib/fsm/core/types";
import { SlotKey } from "@/lib/enums/slot-key";
import { MenuChoice } from "@/lib/enums/menu-choice";
import { PostLoginFlow } from "@/lib/enums/post-login-flow";
import { SessionChannel as Channel } from "@/lib/enums/session-channel";
import { SessionState } from "@/lib/enums/session-state";
import { SessionStatePrefix } from "@/lib/enums/session-state-prefix";
import { InternalEventType } from "@/lib/enums/internal-event-type";

afterEach(() => {
  vi.unstubAllEnvs();
});

const FROM = "sandbox-referencia-entry";
const typed = (value: string, channel: SessionChannel): InboundEvent => ({ from: FROM, type: "text", text: value, channel });
const tapped = (id: string, channel: SessionChannel): InboundEvent => ({ from: FROM, type: "list", listId: id, channel });
const mainMenu = (slots: Session["slots"] = {}): Session => ({ state: SessionState.MAIN_MENU, slots, counters: {} });
const CHANNELS = [Channel.WHATSAPP, Channel.WEB];

const sent = (result: HandlerResult): SendEffect[] => result.effects.filter((effect): effect is SendEffect => !isQueryEffect(effect));
const texts = (result: HandlerResult): string[] => sent(result).flatMap((effect) => (effect.kind === "send_text" ? [effect.text] : []));

function expectLoginForReferencias(result: HandlerResult) {
  expect(result.session.state).toBe(SessionState.CITA_AWAITING_DNI);
  expect(result.session.slots[SlotKey.POST_LOGIN_FLOW]).toBe(PostLoginFlow.REFERENCIAS);
  expect(result.effects.some(isQueryEffect)).toBe(false);
  expect(texts(result)).toEqual([REFERENCIA_LOGIN_REQUIRED_TEXT]);
}

describe("isReferenciaKeyword", () => {
  it.each([
    "referencia",
    "Referencias",
    "REFERENCIA",
    "quiero consultar mi referencia",
    "consultar referencia",
    "Estado de mi referencia",
    "ver mis referencias",
    "mi referencia médica",
    "necesito revisar mis referencias",
    "¿quiero ver mis referencias?",
  ])("%j is a request to consult the referencias", (message) => {
    expect(isReferenciaKeyword(message)).toBe(true);
  });

  it.each([
    "",
    "hola",
    "quiero una cita",
    "¿Ya aceptaron mi referencia?",
    "Tengo mi hoja de referencia de mi posta para el Hospital Loayza",
    "Quiero cita con especialista pero me piden hoja de referencia",
    "¿qué es la contrarreferencia?",
    "vivo cerca del parque, punto de referencia el mercado",
    "quiero consultar mi incidencia",
  ])("%j is not", (message) => {
    expect(isReferenciaKeyword(message)).toBe(false);
  });
});

describe("main menu: entering Consultar referencia", () => {
  it.each([Channel.WEB, Channel.WHATSAPP])("tapping the row asks to log in first (%s)", (channel) => {
    expectLoginForReferencias(handle(mainMenu(), tapped(MenuChoice.CONSULTAR_REFERENCIA, channel)));
  });

  it.each([Channel.WEB, Channel.WHATSAPP])("writing the keyword asks to log in first, with the same logic (%s)", (channel) => {
    for (const message of ["referencia", "quiero consultar mi referencia", "Mis referencias"]) {
      expectLoginForReferencias(handle(mainMenu(), typed(message, channel)));
    }
  });

  it("wins over the out-of-scope rule that used to catch the word", () => {
    const result = handle(mainMenu(), typed("quiero consultar mi referencia", Channel.WHATSAPP));

    expect(result.session.state).not.toBe(SessionState.MAIN_MENU_REFERENCIA_CHOICE);
    expect(result.notes).toContainEqual({ kind: "shortcut", detail: { name: "referencia_keyword" } });
  });

  it.each(["¿Ya aceptaron mi referencia?", "Tengo mi hoja de referencia de mi posta para el Hospital Loayza"])(
    "%j gets the choice between consulting the referencia and booking a cita",
    (message) => {
      const result = handle(mainMenu(), typed(message, Channel.WEB));

      expect(result.session.state).toBe(SessionState.MAIN_MENU_REFERENCIA_CHOICE);
      expect(result.session.slots[SlotKey.POST_LOGIN_FLOW]).toBeUndefined();
      expect(sent(result)).toEqual([{ kind: "send_buttons", text: REFERENCIA_CHOICE_QUESTION_TEXT, buttons: REFERENCIA_CHOICE_BUTTONS }]);
    },
  );

  it("does not carry the opening message into the login of the referencias", () => {
    const result = handle(
      mainMenu({ [SlotKey.INITIAL_MESSAGE_TEXT]: "vivo en Miraflores" }),
      tapped(MenuChoice.CONSULTAR_REFERENCIA, Channel.WEB),
    );

    expect(result.session.slots[SlotKey.INITIAL_MESSAGE_TEXT]).toBeUndefined();
  });

  it.each(CHANNELS)("the %s numbering has the referencia at 2, with the incidencias on or off", (channel) => {
    for (const value of ["true", "false"]) {
      vi.stubEnv("INCIDENCIAS_ENABLED", value);

      expectLoginForReferencias(handle(mainMenu(), typed("2", channel)));
    }
  });

  it.each(CHANNELS)("with the incidencias on, the %s digits 3 and 4 open the incidencia and the consulta", (channel) => {
    vi.stubEnv("INCIDENCIAS_ENABLED", "true");

    expect(handle(mainMenu(), typed("3", channel)).session.state.startsWith(SessionStatePrefix.INCIDENCIA)).toBe(true);
    expect(handle(mainMenu(), typed("4", channel)).session.state.startsWith(SessionStatePrefix.CONSULTA)).toBe(true);
  });

  it.each(CHANNELS)("with the incidencias off, the %s digits 3 and 4 answer the notice and show the menu", (channel) => {
    vi.stubEnv("INCIDENCIAS_ENABLED", "false");

    for (const digit of ["3", "4"]) {
      const result = handle(mainMenu(), typed(digit, channel));

      expect(result.effects).toEqual([{ kind: "send_text", text: SERVICE_DISABLED_TEXT }, buildMenuEffect(channel)]);
      expect(result.session.slots[SlotKey.POST_LOGIN_FLOW]).toBeUndefined();
    }
  });

  it.each(CHANNELS)("the menu it shows in %s has the referencia row in second place, with the incidencias on or off", (channel) => {
    for (const value of ["true", "false"]) {
      vi.stubEnv("INCIDENCIAS_ENABLED", value);
      const list = sent(handle(mainMenu(), typed("hola", channel))).find((effect) => effect.kind === "send_interactive_list");
      const rowIds = list?.kind === "send_interactive_list" ? list.rows.map((row) => row.id) : [];

      expect(rowIds.slice(0, 2)).toEqual([MenuChoice.AGENDAR_CITA, MenuChoice.CONSULTAR_REFERENCIA]);
    }
  });

  it("the out-of-scope reply of the AI shows the menu of the channel it came from", () => {
    const aiSays = (channel: SessionChannel): QueryResultEvent => ({
      from: FROM,
      type: InternalEventType.QUERY_RESULT,
      queryKind: "analyze_main_menu_intent",
      result: { intent: "fuera_de_alcance" },
      channel,
    });
    const pending: Session = { state: SessionState.MAIN_MENU_INTENT_PENDING, slots: {}, counters: {} };

    expect(handleMainMenuIntentPending(pending, aiSays(Channel.WEB)).effects).toEqual([
      { kind: "send_text", text: OUT_OF_SCOPE_REQUEST_TEXT },
      buildMenuEffect(Channel.WEB),
    ]);
    expect(handleMainMenuIntentPending(pending, aiSays(Channel.WHATSAPP)).effects).toEqual([
      { kind: "send_text", text: OUT_OF_SCOPE_REQUEST_TEXT },
      buildMenuEffect(Channel.WHATSAPP),
    ]);
  });
});

describe("first contact: entering Consultar referencia", () => {
  it.each([Channel.WEB, Channel.WHATSAPP])("the keyword asks to log in first (%s)", (channel) => {
    for (const message of ["referencia", "quiero consultar mi referencia"]) {
      const result = handleFirstContact(message, channel);

      expectLoginForReferencias(result);
      expect(result.notes).toContainEqual({ kind: "first_contact", detail: { route: "referencia" } });
    }
  });

  it.each(CHANNELS)("the digit 2 enters it (%s)", (channel) => {
    expectLoginForReferencias(handleFirstContact("2", channel));
  });

  it("a referencia that is not a plain request gets the choice between consulting it and booking a cita", () => {
    const result = handleFirstContact("¿Ya aceptaron mi referencia?", Channel.WHATSAPP);

    expect(result.session.state).toBe(SessionState.MAIN_MENU_REFERENCIA_CHOICE);
    expect(sent(result)).toEqual([{ kind: "send_buttons", text: REFERENCIA_CHOICE_QUESTION_TEXT, buttons: REFERENCIA_CHOICE_BUTTONS }]);
  });

  it.each(CHANNELS)("a menu shown after a first contact it did not understand has the referencia row (%s)", (channel) => {
    const list = sent(handleFirstContact("zzzz qwerty asdf", channel)).find((effect) => effect.kind === "send_interactive_list");
    const rowIds = list?.kind === "send_interactive_list" ? list.rows.map((row) => row.id) : [];

    expect(rowIds).toContain(MenuChoice.CONSULTAR_REFERENCIA);
  });
});

describe("the other doors to the main menu keep the channel", () => {
  it("a stale awaiting_flow_start with no choice shows the menu of the channel", () => {
    const stale: Session = { state: SessionState.AWAITING_FLOW_START, slots: {}, counters: {} };

    expect(handle(stale, typed("x", Channel.WEB)).effects).toEqual([buildMenuEffect(Channel.WEB)]);
    expect(handle(stale, typed("x", Channel.WHATSAPP)).effects).toEqual([buildMenuEffect(Channel.WHATSAPP)]);
  });

  it("the notice after a complaint with insults, with the incidencias off, shows the menu of the web channel", () => {
    vi.stubEnv("INCIDENCIAS_ENABLED", "false");

    const result = handle(mainMenu(), typed("Doctora imbécil no me dio mi medicina", Channel.WEB));

    expect(result.effects).toEqual([{ kind: "send_text", text: SERVICE_DISABLED_TEXT }, buildMenuEffect(Channel.WEB)]);
  });
});
