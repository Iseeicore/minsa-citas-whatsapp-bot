import { afterEach, describe, expect, it, vi } from "vitest";
import { handle } from "@/lib/fsm/core/handlers";
import { handleFirstContact } from "@/lib/fsm/routing/first-contact";
import { sendButtons, sendCtaUrl, sendText } from "@/lib/fsm/core/handlers-shared";
import type { HandlerResult, Session } from "@/lib/fsm/core/types";
import { ASK_DOCUMENTO_TEXT } from "@/lib/constants/textos/identidad";
import { FALLBACK_TEXT } from "@/lib/constants/textos/comunes";
import { firstContactCitaRequestText } from "@/lib/constants/textos/menu";
import { RESPECT_REMINDER_TEXT } from "@/lib/constants/textos/seguridad";
import { CITA_ABANDONED_TEXT } from "@/lib/constants/textos/cita-salida";
import {
  CUENTA_MINSA_CREADA_BUTTONS,
  CUENTA_MINSA_CREADA_TEXT,
  CUENTA_MINSA_CREAR_BUTTON_TEXT,
  CUENTA_MINSA_CREAR_TEXT,
  CUENTA_MINSA_NO_CONTINUAR_BUTTON_TEXT,
  CUENTA_MINSA_NO_TIENE_BUTTON_TEXT,
  CUENTA_MINSA_TIENE_BUTTON_TEXT,
} from "@/lib/constants/textos/cita-identidad";
import { CuentaMinsaButtonId } from "@/lib/enums/cuenta-minsa-button-id";
import { ExitButtonId } from "@/lib/enums/exit-button-id";
import { HandlerOutcome } from "@/lib/enums/handler-outcome";
import { MenuChoice } from "@/lib/enums/menu-choice";
import { QueryKind } from "@/lib/enums/query-kind";
import { SessionChannel } from "@/lib/enums/session-channel";
import { SessionState } from "@/lib/enums/session-state";
import { SlotKey } from "@/lib/enums/slot-key";
import { TerminosButtonId } from "@/lib/enums/terminos-button-id";
import { cuentaMinsaAviso } from "@/tests/support/cuenta-minsa";
import { queryResult, sent, tap, text, texts } from "@/tests/support/fsm-events";

const REGISTRO_URL = "https://fake-minsa-digital.test/login";
const MAIN_MENU: Session = { state: SessionState.MAIN_MENU, slots: {}, counters: {} };
const CREADA = sendButtons(CUENTA_MINSA_CREADA_TEXT, CUENTA_MINSA_CREADA_BUTTONS);

const warned = (channel = SessionChannel.WHATSAPP) => handle(MAIN_MENU, tap(MenuChoice.AGENDAR_CITA, channel)).session;
const invited = () => handle(warned(), tap(CuentaMinsaButtonId.NO_TIENE)).session;

function expectDocumento(result: HandlerResult, intro = ASK_DOCUMENTO_TEXT) {
  expect(result.session.state).toBe(SessionState.CITA_AWAITING_DNI);
  expect(sent(result)).toEqual([sendText(intro)]);
  expect(result.session.slots[SlotKey.CITA_DOCUMENTO_INTRO_TEXT]).toBeUndefined();
}

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("the MINSA Digital account warning", () => {
  it("comes before the document, with the terms off or after «Acepto», and «Ya cuento con una» asks for the document", () => {
    for (const channel of [SessionChannel.WHATSAPP, SessionChannel.WEB]) {
      const fromMenu = handle(MAIN_MENU, tap(MenuChoice.AGENDAR_CITA, channel));
      expect(fromMenu.session.state).toBe(SessionState.CITA_AWAITING_CUENTA_MINSA);
      expect(sent(fromMenu)).toEqual([cuentaMinsaAviso()]);
      expectDocumento(handle(fromMenu.session, tap(CuentaMinsaButtonId.TIENE, channel)));
    }

    vi.stubEnv("TERMINOS_ENABLED", "true");
    const accepted = handle(handle(MAIN_MENU, tap(MenuChoice.AGENDAR_CITA)).session, tap(TerminosButtonId.ACCEPT));
    const afterTerms = handle(accepted.session, queryResult(QueryKind.REGISTRAR_ACEPTACION_TERMINOS, { resultado: "saved" }));
    expect(sent(afterTerms)).toEqual([cuentaMinsaAviso()]);
    expectDocumento(handle(afterTerms.session, tap(CuentaMinsaButtonId.TIENE)));
  });

  it("keeps the intro of the request for the document, and asks the plain one when the session lost it", () => {
    const request = handleFirstContact("quiero cita de pediatría en San Borja", SessionChannel.WHATSAPP);
    expectDocumento(handle(request.session, tap(CuentaMinsaButtonId.TIENE)), firstContactCitaRequestText(" de Pediatría", " en San Borja"));

    const lost: Session = { state: SessionState.CITA_AWAITING_CUENTA_MINSA, slots: {}, counters: {} };
    expectDocumento(handle(lost, tap(CuentaMinsaButtonId.TIENE)));
  });

  it("«No cuento con una» sends the link and the buttons; then «Ya cuento con una» or «No deseo continuar»", () => {
    const invitation = handle(warned(), tap(CuentaMinsaButtonId.NO_TIENE));
    expect(invitation.session.state).toBe(SessionState.CITA_AWAITING_CUENTA_MINSA_CREADA);
    expect(sent(invitation)).toEqual([sendCtaUrl(CUENTA_MINSA_CREAR_TEXT, CUENTA_MINSA_CREAR_BUTTON_TEXT, REGISTRO_URL), CREADA]);

    expectDocumento(handle(invitation.session, tap(CuentaMinsaButtonId.TIENE)));

    const closed = handle(invitation.session, tap(CuentaMinsaButtonId.NO_CONTINUAR));
    expect(closed.session).toEqual({ state: SessionState.CITA_ABANDONED, slots: {}, counters: {} });
    expect(texts(closed)).toEqual([CITA_ABANDONED_TEXT]);
    expect(closed.outcome).toBe(HandlerOutcome.CLOSED);

    vi.stubEnv("MINSA_DIGITAL_APP_URL", "");
    expect(sent(handle(warned(), tap(CuentaMinsaButtonId.NO_TIENE)))).toEqual([sendText(CUENTA_MINSA_CREAR_TEXT), CREADA]);
  });

  it("understands typed answers and asks again with the same buttons otherwise", () => {
    expectDocumento(handle(warned(), text("sí")));
    expectDocumento(handle(warned(), text(CUENTA_MINSA_TIENE_BUTTON_TEXT)));
    expect(handle(warned(), text(CUENTA_MINSA_NO_TIENE_BUTTON_TEXT)).session.state).toBe(SessionState.CITA_AWAITING_CUENTA_MINSA_CREADA);
    expectDocumento(handle(invited(), text("listo")));
    expect(handle(invited(), text("no")).session.state).toBe(SessionState.CITA_ABANDONED);
    expect(handle(invited(), text(CUENTA_MINSA_NO_CONTINUAR_BUTTON_TEXT)).session.state).toBe(SessionState.CITA_ABANDONED);

    expect(sent(handle(warned(), text("tengo una pregunta")))).toEqual([sendText(FALLBACK_TEXT), cuentaMinsaAviso()]);
    expect(sent(handle(invited(), tap(CuentaMinsaButtonId.NO_TIENE)))).toEqual([sendText(FALLBACK_TEXT), CREADA]);
    expect(texts(handle(warned(), text("cojudos")))).toContain(RESPECT_REMINDER_TEXT);

    const leaving = handle(invited(), text("salir"));
    expect(leaving.session.state).toBe(SessionState.CITA_AWAITING_EXIT_CONFIRM);
    expect(sent(handle(leaving.session, tap(ExitButtonId.NO)))).toEqual([CREADA]);
  });
});
