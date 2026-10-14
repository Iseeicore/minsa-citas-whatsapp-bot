import { afterEach, describe, expect, it, vi } from "vitest";
import { handle } from "@/lib/fsm/core/handlers";
import { isQueryEffect } from "@/lib/fsm/core/handlers-shared";
import { handleFirstContact } from "@/lib/fsm/routing/first-contact";
import { isReferenciaKeyword } from "@/lib/fsm/routing/menu-shortcuts";
import { buildMenuEffect } from "@/lib/fsm/routing/flow-entry";
import { handleMainMenuIntentPending } from "@/lib/fsm/routing/main-menu";
import { REFERENCIA_LOGIN_REQUIRED_TEXT } from "@/lib/constants/textos/referencia";
import { OOS_MESSAGES } from "@/lib/constants/textos/fuera-de-alcance";
import { OUT_OF_SCOPE_REQUEST_TEXT, SERVICE_DISABLED_TEXT, SERVICE_DISABLED_WEB_TEXT } from "@/lib/constants/textos/menu";
import type { HandlerResult, InboundEvent, QueryResultEvent, SendEffect, Session, SessionChannel } from "@/lib/fsm/core/types";
import { SlotKey } from "@/lib/enums/slot-key";
import { MenuChoice } from "@/lib/enums/menu-choice";
import { OosCategory } from "@/lib/enums/oos-category";
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

    expect(texts(result)).not.toContain(OOS_MESSAGES[OosCategory.OOS_03]);
    expect(result.notes).toContainEqual({ kind: "shortcut", detail: { name: "referencia_keyword" } });
  });

  it.each(["¿Ya aceptaron mi referencia?", "Tengo mi hoja de referencia de mi posta para el Hospital Loayza"])(
    "%j keeps the out-of-scope answer",
    (message) => {
      const result = handle(mainMenu(), typed(message, Channel.WEB));

      expect(result.session.state).toBe(SessionState.MAIN_MENU);
      expect(result.session.slots[SlotKey.POST_LOGIN_FLOW]).toBeUndefined();
      expect(texts(result)).toEqual([OOS_MESSAGES[OosCategory.OOS_03]]);
    },
  );

  it("does not carry the opening message into the login of the referencias", () => {
    const result = handle(
      mainMenu({ [SlotKey.INITIAL_MESSAGE_TEXT]: "vivo en Miraflores" }),
      tapped(MenuChoice.CONSULTAR_REFERENCIA, Channel.WEB),
    );

    expect(result.session.slots[SlotKey.INITIAL_MESSAGE_TEXT]).toBeUndefined();
  });

  it("the web numbering has the referencia at 2, with the incidencias on or off", () => {
    for (const value of ["true", "false"]) {
      vi.stubEnv("INCIDENCIAS_ENABLED", value);

      expectLoginForReferencias(handle(mainMenu(), typed("2", Channel.WEB)));
    }
  });

  it("the whatsapp digits never point at the referencia: 2 is still the incidencia, or the notice when it is off", () => {
    vi.stubEnv("INCIDENCIAS_ENABLED", "true");
    const incidencia = handle(mainMenu(), typed("2", Channel.WHATSAPP));
    expect(incidencia.session.state.startsWith(SessionStatePrefix.INCIDENCIA)).toBe(true);

    vi.stubEnv("INCIDENCIAS_ENABLED", "false");
    const off = handle(mainMenu(), typed("2", Channel.WHATSAPP));
    expect(texts(off)).toEqual([SERVICE_DISABLED_TEXT]);
    expect(off.session.slots[SlotKey.POST_LOGIN_FLOW]).toBeUndefined();
  });

  it("with the incidencias off, the web digits 3 and 4 answer the notice and show the web menu", () => {
    vi.stubEnv("INCIDENCIAS_ENABLED", "false");

    for (const digit of ["3", "4"]) {
      const result = handle(mainMenu(), typed(digit, Channel.WEB));

      expect(result.effects).toEqual([{ kind: "send_text", text: SERVICE_DISABLED_WEB_TEXT }, buildMenuEffect(Channel.WEB)]);
    }
  });

  it("the menu it shows follows the channel of the person", () => {
    const rowIds = (channel: SessionChannel) => {
      const list = sent(handle(mainMenu(), typed("hola", channel))).find((effect) => effect.kind === "send_interactive_list");
      return list?.kind === "send_interactive_list" ? list.rows.map((row) => row.id) : [];
    };

    expect(rowIds(Channel.WEB)).toContain(MenuChoice.CONSULTAR_REFERENCIA);
    expect(rowIds(Channel.WHATSAPP)).not.toContain(MenuChoice.CONSULTAR_REFERENCIA);
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

  it("the web digit 2 enters it, the whatsapp digit 2 does not", () => {
    expectLoginForReferencias(handleFirstContact("2", Channel.WEB));
    expect(handleFirstContact("2", Channel.WHATSAPP).session.slots[SlotKey.POST_LOGIN_FLOW]).toBeUndefined();
  });

  it("a referencia that is not a plain request keeps the out-of-scope answer", () => {
    const result = handleFirstContact("¿Ya aceptaron mi referencia?", Channel.WHATSAPP);

    expect(texts(result)).toEqual([OOS_MESSAGES[OosCategory.OOS_03]]);
  });

  it("a menu shown after a first contact it did not understand follows the channel", () => {
    const rows = (channel: SessionChannel) => {
      const list = sent(handleFirstContact("zzzz qwerty asdf", channel)).find((effect) => effect.kind === "send_interactive_list");
      return list?.kind === "send_interactive_list" ? list.rows.map((row) => row.id) : [];
    };

    expect(rows(Channel.WEB)).toContain(MenuChoice.CONSULTAR_REFERENCIA);
    expect(rows(Channel.WHATSAPP)).not.toContain(MenuChoice.CONSULTAR_REFERENCIA);
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

    expect(result.effects).toEqual([{ kind: "send_text", text: SERVICE_DISABLED_WEB_TEXT }, buildMenuEffect(Channel.WEB)]);
  });
});
