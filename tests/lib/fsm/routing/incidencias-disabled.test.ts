import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { handle } from "@/lib/fsm/core/handlers";
import { isQueryEffect } from "@/lib/fsm/core/handlers-shared";
import { handleFirstContact } from "@/lib/fsm/routing/first-contact";
import { buildMenuEffect } from "@/lib/fsm/routing/flow-entry";
import { handleMainMenuIntentPending } from "@/lib/fsm/routing/main-menu";
import { oosMessage } from "@/lib/fsm/flows/out-of-scope/out-of-scope";
import { OOS_MESSAGES } from "@/lib/constants/textos/fuera-de-alcance";
import { OUT_OF_SCOPE_REQUEST_TEXT } from "@/lib/constants/textos/menu";
import { INSTITUTIONAL_WARNING_TEXT, RESPECT_REMINDER_TEXT } from "@/lib/constants/textos/seguridad";
import { IncidenciaService } from "@/lib/services/incidencia-service";
import type { HandlerResult, InboundEvent, QueryResultEvent, SendEffect, Session } from "@/lib/fsm/core/types";
import { SlotKey } from "@/lib/enums/slot-key";
import { MenuChoice } from "@/lib/enums/menu-choice";
import { OosCategory } from "@/lib/enums/oos-category";
import { SessionChannel } from "@/lib/enums/session-channel";
import { InternalEventType } from "@/lib/enums/internal-event-type";

const FROM = "sandbox-incidencias-off";
const NOW = Date.parse("2026-10-11T15:00:00Z");

const text = (value: string): InboundEvent => ({ from: FROM, type: "text", text: value });
const tap = (id: string): InboundEvent => ({ from: FROM, type: "list", listId: id });
const menu = (slots: Session["slots"] = {}): Session => ({ state: "main_menu", slots, counters: {} });
const sessionAt = (state: string, slots: Session["slots"] = {}, idleMs = 0): Session => ({
  state: state as Session["state"],
  slots,
  counters: {},
  updatedAt: new Date(NOW - idleMs),
});

const sent = (result: HandlerResult): SendEffect[] => result.effects.filter((effect): effect is SendEffect => !isQueryEffect(effect));
const queries = (result: HandlerResult) => result.effects.filter(isQueryEffect);
const NOTICE = new IncidenciaService().disabledReply();
const CITA_AND_REFERENCIA = ["agendar_cita", "consultar_referencia"];

const QR = "Hola quiero presentar una incidencia HOSPITAL NACIONAL DOS DE MAYO - CODIGO-IPRESS 6206";
const CODIGO_MSG = "quiero ver mi incidencia MINSA-2026-000003";

function expectNoticeAndMenu(result: HandlerResult, state: Session["state"] = "main_menu") {
  expect(result.session.state).toBe(state);
  expect(queries(result)).toHaveLength(0);
  expect(sent(result)).toEqual([{ kind: "send_text", text: NOTICE }, buildMenuEffect(SessionChannel.WHATSAPP)]);
}

describe("with INCIDENCIAS_ENABLED off", () => {
  beforeEach(() => {
    vi.stubEnv("INCIDENCIAS_ENABLED", "false");
  });
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  describe("the menu", () => {
    it("has exactly two rows: the cita and the referencia", () => {
      const [list] = sent(handle(menu(), text("hola")));

      expect(list).toMatchObject({ kind: "send_interactive_list" });
      expect(list.kind === "send_interactive_list" && list.rows).toEqual([
        { id: "agendar_cita", title: "Agendar una cita médica" },
        { id: "consultar_referencia", title: "Cita con referencia" },
      ]);
    });

    it("is the same two-row menu on a first contact that does not know what to answer", () => {
      const result = handleFirstContact("ayuda por favor", "whatsapp");

      const [list] = sent(result);
      expect(list.kind === "send_interactive_list" && list.rows.map((row) => row.id)).toEqual(CITA_AND_REFERENCIA);
    });

    it("the notice says that only the citas and the referencias are available", () => {
      expect(NOTICE).toMatch(/cita/i);
      expect(NOTICE).toMatch(/referencia/i);
      expect(NOTICE).not.toMatch(/incidencia|denuncia|registrar/i);
    });
  });

  describe("entry points from the main menu", () => {
    it.each([
      ["the old Registrar button", tap(MenuChoice.REGISTRAR_INCIDENCIA)],
      ["the old Consultar button", tap(MenuChoice.CONSULTAR_INCIDENCIA)],
      ["the word incidencia", text("incidencia")],
      ["a consulta keyword", text("quiero consultar mi incidencia")],
      ["a MINSA code inside a sentence", text(CODIGO_MSG)],
      ["the QR message", text(QR)],
    ])("%s answers with the notice and the menu, and starts nothing", (_label, event) => {
      expectNoticeAndMenu(handle(menu(), event));
    });

    it("keeps the slots the person already had, like any return to the menu", () => {
      const result = handle(menu({ [SlotKey.INITIAL_MESSAGE_TEXT]: "hola" }), text("incidencia"));

      expect(result.session.slots[SlotKey.INITIAL_MESSAGE_TEXT]).toBe("hola");
    });

    it.each(["3", "4", " 3 "])("typed %j answers with the notice and the two-row menu, without asking the AI", (digit) => {
      const result = handle(menu(), text(digit));

      expectNoticeAndMenu(result);
      const [, list] = sent(result);
      expect(list.kind === "send_interactive_list" && list.rows.map((row) => row.id)).toEqual(CITA_AND_REFERENCIA);
    });

    it("typed 2 is the referencia, not the notice", () => {
      const result = handle(menu(), text("2"));

      expect(result.session.slots[SlotKey.POST_LOGIN_FLOW]).toBe("referencias");
      expect(sent(result)).not.toContainEqual({ kind: "send_text", text: NOTICE });
    });

    it("a number beyond the known services does not get the notice", () => {
      expect(sent(handle(menu(), text("5")))).not.toContainEqual({ kind: "send_text", text: NOTICE });
    });

    it("the incidencia keyword reports only that the service is disabled", () => {
      const result = handle(menu(), text("incidencia"));

      expect(result.notes).toEqual([{ kind: "shortcut", detail: { name: "service_disabled", service: "registrar_incidencia" } }]);
    });

    it("typed 1 and the cita keywords still start the cita", () => {
      expect(handle(menu(), text("1")).session.state).toBe("cita_awaiting_dni");
      expect(handle(menu(), tap(MenuChoice.AGENDAR_CITA)).session.state).toBe("cita_awaiting_dni");
      expect(handle(menu(), text("quiero una cita")).session.state).toBe("cita_awaiting_dni");
    });

    it("a stale awaiting_flow_start that chose registrar answers with the notice", () => {
      const stale = sessionAt("awaiting_flow_start", { [SlotKey.MENU_CHOICE]: MenuChoice.REGISTRAR_INCIDENCIA });

      expectNoticeAndMenu(handle(stale, text("lo que sea")));
    });
  });

  describe("entry points from a first contact", () => {
    it.each([
      ["the QR message", QR],
      ["a MINSA code", CODIGO_MSG],
      ["a consulta keyword", "quiero consultar mi incidencia"],
      ["the word incidencia", "incidencia"],
    ])("%s answers with the notice and the menu", (_label, message) => {
      const result = handleFirstContact(message, "whatsapp");

      expectNoticeAndMenu(result);
      expect(result.notes).toContainEqual({ kind: "first_contact", detail: { route: "menu" } });
    });

    it.each(["3", "4"])("typed %s answers with the notice and the two-row menu", (digit) => {
      const result = handleFirstContact(digit, "whatsapp");

      expectNoticeAndMenu(result);
      expect(result.notes).toContainEqual({ kind: "first_contact", detail: { route: "menu" } });
    });

    it("typed 1 still starts the cita", () => {
      expect(handleFirstContact("1", "whatsapp").session.state).toBe("cita_awaiting_dni");
    });
  });

  describe("the AI", () => {
    const aiSays = (intent: string): QueryResultEvent => ({
      from: FROM,
      type: InternalEventType.QUERY_RESULT,
      queryKind: "analyze_main_menu_intent",
      result: { intent },
    });
    const pending = sessionAt("main_menu_intent_pending", { [SlotKey.INCIDENCIA_BORRADOR]: "me trataron mal" });

    it("an incidencia intent answers with the notice and the menu", () => {
      const result = handleMainMenuIntentPending(pending, aiSays("incidencia"));

      expectNoticeAndMenu(result);
      expect(result.session.slots[SlotKey.INCIDENCIA_BORRADOR]).toBeUndefined();
    });

    it("the out-of-scope request names only the citas and the referencias", () => {
      const result = handleMainMenuIntentPending(pending, aiSays("fuera_de_alcance"));

      const [message] = sent(result);
      expect(message).toMatchObject({ kind: "send_text" });
      expect(message.kind === "send_text" && message.text).not.toMatch(/incidencia|denuncia/i);
      expect(message.kind === "send_text" && message.text).toMatch(/cita/i);
      expect(message.kind === "send_text" && message.text).toMatch(/referencia/i);
    });

    it("a referencia intent still opens the referencias", () => {
      const result = handleMainMenuIntentPending(pending, aiSays("referencia"));

      expect(result.session.slots[SlotKey.POST_LOGIN_FLOW]).toBe("referencias");
      expect(result.session.slots[SlotKey.INCIDENCIA_BORRADOR]).toBeUndefined();
    });
  });

  describe("the lexical guard", () => {
    it("a complaint with insults no longer forces an incidencia: notice and menu", () => {
      expectNoticeAndMenu(handle(menu(), text("Doctora imbécil no me dio mi medicina")));
    });

    it("the institutional warning does not invite to write INCIDENCIA", () => {
      const [warning] = sent(handle(menu(), text("hdp")));

      expect(warning).toMatchObject({ kind: "send_buttons" });
      expect(warning.kind === "send_buttons" && warning.text).not.toBe(INSTITUTIONAL_WARNING_TEXT);
      expect(warning.kind === "send_buttons" && warning.text).not.toMatch(/incidencia|denuncia/i);
      expect(warning.kind === "send_buttons" && warning.text).toBe(RESPECT_REMINDER_TEXT);
    });
  });

  describe("a session that was inside an incident flow", () => {
    it.each([
      "incidencia_awaiting_descripcion",
      "incidencia_confirm_registro",
      "incidencia_submit_pending",
      "incidencia_awaiting_reauth",
      "consulta_awaiting_codigo",
      "consulta_awaiting_dni",
      "consulta_query_pending",
    ])("%s goes back to the main menu with the notice, with clean slots", (state) => {
      const stale = sessionAt(state, {
        [SlotKey.INCIDENCIA_BORRADOR]: "algo",
        [SlotKey.INCIDENCIA_RESUME_STATE]: "incidencia_awaiting_foto",
      });

      const result = handle(stale, text("sigo aquí"), NOW);

      expectNoticeAndMenu(result);
      expect(result.session.slots).toEqual({});
    });

    it("also when the session had gone idle (the expiry path would have asked to re-authenticate)", () => {
      const idle = sessionAt("incidencia_awaiting_foto", {}, 15 * 60_000);

      const result = handle(idle, text("sigo aquí"), NOW);

      expectNoticeAndMenu(result);
    });

    it("also for a query result that arrives after the flag was turned off", () => {
      const result = handle(sessionAt("incidencia_submit_pending"), {
        from: FROM,
        type: InternalEventType.QUERY_RESULT,
        queryKind: "incidencia_register",
        result: { ok: true },
      });

      expectNoticeAndMenu(result);
    });

    it("a finished incident flow does not trap the person: the next message is a normal first contact", () => {
      for (const state of ["incidencia_confirmed", "incidencia_cancelled", "consulta_completed", "consulta_failed"]) {
        expect(handle(sessionAt(state), text("1"), NOW).session.state).toBe("cita_awaiting_dni");
      }
    });

    it("cita sessions are untouched", () => {
      const result = handle(sessionAt("cita_awaiting_dni"), text("12345678"), NOW);

      expect(result.session.state).not.toBe("main_menu");
      expect(JSON.stringify(sent(result))).not.toContain(NOTICE);
    });
  });

  describe("the texts that name the options", () => {
    it("the out-of-scope request names only the citas and the referencias", () => {
      const [reply] = sent(
        handleMainMenuIntentPending(sessionAt("main_menu_intent_pending"), {
          from: FROM,
          type: InternalEventType.QUERY_RESULT,
          queryKind: "analyze_main_menu_intent",
          result: { intent: "fuera_de_alcance" },
        }),
      );

      expect(reply).toEqual({
        kind: "send_text",
        text: "Solo puedo ayudarte a agendar una cita médica o una cita con referencia. Elige una opción:",
      });
    });

    it("no out-of-scope answer sends the person to write INCIDENCIA", () => {
      for (const message of (Object.keys(OOS_MESSAGES) as Array<keyof typeof OOS_MESSAGES>).map((category) => oosMessage(category))) {
        expect(message).not.toMatch(/incidencia|denuncia/i);
      }
    });

    it("the out-of-scope answers that do not name the option stay byte-identical", () => {
      expect(oosMessage(OosCategory.OOS_02)).toBe(OOS_MESSAGES["OOS-02"]);
      expect(oosMessage(OosCategory.OOS_01)).toBe(OOS_MESSAGES["OOS-01"]);
    });

    it("medicines and complaints follow-up are answered in menu and first contact without the option", () => {
      const inMenu = sent(handle(menu(), text("¿dónde puedo ver el estado de mi reclamo?")));
      const first = sent(handleFirstContact("¿dónde puedo ver el estado de mi reclamo?", "whatsapp"));

      for (const effects of [inMenu, first]) {
        expect(JSON.stringify(effects)).not.toMatch(/escriba DENUNCIA/);
      }
    });
  });
});

describe("with INCIDENCIAS_ENABLED on, nothing changes", () => {
  beforeEach(() => {
    vi.stubEnv("INCIDENCIAS_ENABLED", "true");
  });
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("the menu has the four rows", () => {
    const [list] = sent(handle(menu(), text("hola")));

    expect(list.kind === "send_interactive_list" && list.rows.map((row) => row.id)).toEqual([
      "agendar_cita",
      "consultar_referencia",
      "registrar_incidencia",
      "consultar_incidencia",
    ]);
  });

  it("the buttons, the numbers and the keywords reach their flows", () => {
    expect(handle(menu(), tap(MenuChoice.REGISTRAR_INCIDENCIA)).session.state).toMatch(/^incidencia_/);
    expect(handle(menu(), tap(MenuChoice.CONSULTAR_INCIDENCIA)).session.state).toMatch(/^consulta_/);
    expect(handle(menu(), text("3")).session.state).toMatch(/^incidencia_/);
    expect(handle(menu(), text("4")).session.state).toMatch(/^consulta_/);
    expect(handle(menu(), text("incidencia")).session.state).toMatch(/^incidencia_/);
    expect(handleFirstContact("3", "whatsapp").session.state).toMatch(/^incidencia_/);
    expect(handleFirstContact("4", "whatsapp").session.state).toMatch(/^consulta_/);
  });

  it("the out-of-scope request from the AI names the three services", () => {
    const result = handleMainMenuIntentPending(sessionAt("main_menu_intent_pending"), {
      from: FROM,
      type: InternalEventType.QUERY_RESULT,
      queryKind: "analyze_main_menu_intent",
      result: { intent: "fuera_de_alcance" },
    });

    expect(sent(result)).toEqual([{ kind: "send_text", text: OUT_OF_SCOPE_REQUEST_TEXT }, buildMenuEffect(SessionChannel.WHATSAPP)]);
  });

  it("the texts are the original ones", () => {
    expect(oosMessage(OosCategory.OOS_08)).toBe(OOS_MESSAGES["OOS-08"]);
    expect(oosMessage(OosCategory.OOS_05)).toBe(OOS_MESSAGES["OOS-05"]);
  });

  it("a persisted incident session keeps going", () => {
    const result = handle(sessionAt("incidencia_awaiting_descripcion"), text("me trataron mal en la posta"), NOW);

    expect(result.session.state).toMatch(/^incidencia_/);
  });
});

describe("with INCIDENCIAS_ENABLED not defined, the default", () => {
  beforeEach(() => {
    vi.stubEnv("INCIDENCIAS_ENABLED", undefined);
  });
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("the menu has two rows: the cita and the referencia", () => {
    const [list] = sent(handle(menu(), text("hola")));

    expect(list.kind === "send_interactive_list" && list.rows.map((row) => row.id)).toEqual(CITA_AND_REFERENCIA);
  });

  it.each([
    ["the old Registrar button", tap(MenuChoice.REGISTRAR_INCIDENCIA)],
    ["the old Consultar button", tap(MenuChoice.CONSULTAR_INCIDENCIA)],
    ["the word incidencia", text("incidencia")],
    ["a MINSA code", text(CODIGO_MSG)],
  ])("%s answers with the notice and the menu", (_label, event) => {
    expectNoticeAndMenu(handle(menu(), event));
  });

  it("a stored incident session goes back to the menu", () => {
    expectNoticeAndMenu(handle(sessionAt("incidencia_awaiting_descripcion"), text("sigo aquí"), NOW));
  });
});
