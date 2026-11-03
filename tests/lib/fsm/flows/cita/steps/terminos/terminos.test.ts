import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { handle } from "@/lib/fsm/core/handlers";
import { handleFirstContact } from "@/lib/fsm/routing/first-contact";
import { buildTerminosEffect } from "@/lib/fsm/flows/cita/steps/terminos/terminos-gate";
import type { HandleEvent, HandlerResult, QueryResultEvent, Session } from "@/lib/fsm/core/types";
import { ASK_DOCUMENTO_TEXT, WHATSAPP_ASK_DOCUMENTO_TEXT } from "@/lib/constants/textos/identidad";
import { FIRST_CONTACT_CITA_TEXT } from "@/lib/constants/textos/menu";
import { VERIFIED_ASK_DISTRITO_TEXT } from "@/lib/constants/textos/cita-identidad";
import { REFERENCIA_LOGIN_REQUIRED_TEXT } from "@/lib/constants/textos/referencia";
import { RESPECT_REMINDER_TEXT } from "@/lib/constants/textos/seguridad";
import { FALLBACK_TEXT } from "@/lib/constants/textos/comunes";
import {
  DOCUMENTOS_TITULO_TEXT,
  TERMINOS_BUTTONS,
  TERMINOS_PROMPT_TEXT,
  TERMINOS_RECHAZADOS_TEXT,
  TERMINOS_VERSION,
  terminosWhatsappAvisoText,
  terminosWhatsappBodyText,
} from "@/lib/constants/textos/terminos";
import { DATOS_PERSONALES_CONTENIDO, DATOS_PERSONALES_VERSION } from "@/lib/constants/textos/datos-personales";
import { DOCUMENTOS_CITA } from "@/lib/constants/documentos-aceptacion";
import { DocumentoAceptacion } from "@/lib/enums/consentimiento/documento-aceptacion";
import { AceptacionTerminosLookup } from "@/lib/enums/consentimiento/aceptacion-terminos-lookup";
import { ExitButtonId } from "@/lib/enums/botones/exit-button-id";
import { FlujoAceptacion } from "@/lib/enums/consentimiento/flujo-aceptacion";
import { HandlerOutcome } from "@/lib/enums/handler-outcome";
import { MenuChoice } from "@/lib/enums/menu-choice";
import { PostLoginFlow } from "@/lib/enums/post-login-flow";
import { QueryKind } from "@/lib/enums/query-kind";
import { ReferenciaActionButtonId } from "@/lib/enums/botones/referencia-action-button-id";
import { SendType } from "@/lib/enums/send-type";
import { SessionChannel } from "@/lib/enums/session-channel";
import { SessionState } from "@/lib/enums/session-state";
import { SlotKey } from "@/lib/enums/slot-key";
import { TerminosButtonId } from "@/lib/enums/botones/terminos-button-id";
import { TerminosResume } from "@/lib/enums/terminos-resume";
import { VerifyCodeStatus } from "@/lib/enums/verify-code-status";
import { queries, queryResult as resultOn, sent, tap as tapOn, text as textOn, texts } from "@/tests/support/fsm-events";
import { buildReferencia } from "@/tests/support/referencia";
import { confirmCuentaMinsa, cuentaMinsaAviso } from "@/tests/support/cuenta-minsa";

const DNI = "12345678";
const TERMINOS_URL = "https://example.test/terminos";

const tap = (id: string, channel = SessionChannel.WEB) => tapOn(id, channel);
const text = (value: string) => textOn(value, SessionChannel.WEB);
const queryResult = (queryKind: QueryResultEvent["queryKind"], result: unknown) => resultOn(queryKind, result, SessionChannel.WEB);

const mainMenu = (slots: Session["slots"] = {}): Session => ({ state: SessionState.MAIN_MENU, slots, counters: {} });

function verifiedReferencias(state: Session["state"], slots: Session["slots"] = {}): Session {
  return {
    state,
    slots: {
      [SlotKey.CITA_BEARER]: "synthetic-token",
      [SlotKey.CITA_DNI]: DNI,
      [SlotKey.POST_LOGIN_FLOW]: PostLoginFlow.REFERENCIAS,
      [SlotKey.CITA_REFERENCIAS_DATA]: JSON.stringify([buildReferencia()]),
      ...slots,
    },
    counters: {},
  };
}

const notAccepted = queryResult(QueryKind.CONSULTAR_ACEPTACION_TERMINOS, { resultado: AceptacionTerminosLookup.NOT_FOUND });

function shown(result: HandlerResult, lookup: HandleEvent = notAccepted): HandlerResult {
  expect(result.session.state).toBe(SessionState.CITA_TERMINOS_LOOKUP_PENDING);
  expect(sent(result)).toEqual([]);
  expect(queries(result)).toEqual([
    { kind: QueryKind.CONSULTAR_ACEPTACION_TERMINOS, payload: { flujo: FlujoAceptacion.CITA, documentos: DOCUMENTOS_CITA } },
  ]);
  return handle(result.session, lookup);
}

function expectTerminos(result: HandlerResult, resume: TerminosResume) {
  expect(result.session.state).toBe(SessionState.CITA_AWAITING_TERMINOS);
  expect(result.session.slots[SlotKey.TERMINOS_RESUME]).toBe(resume);
  expect(sent(result)).toEqual([buildTerminosEffect()]);
  expect(queries(result)).toEqual([]);
}

function acceptVerified(result: HandlerResult): HandlerResult {
  const accepted = handle(result.session, tap(TerminosButtonId.ACCEPT));
  expect(accepted.session.state).toBe(SessionState.CITA_TERMINOS_REGISTER_PENDING);
  return handle(accepted.session, queryResult(QueryKind.REGISTRAR_ACEPTACION_TERMINOS, { resultado: "saved" }));
}

function accept(result: HandlerResult): HandlerResult {
  return confirmCuentaMinsa(acceptVerified(result), SessionChannel.WEB);
}

beforeEach(() => {
  vi.stubEnv("TERMINOS_ENABLED", "true");
});

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("the terms message", () => {
  it("carries the title, a short question, both documents, one box per document and the Acepto ambos / No acepto buttons", () => {
    expect(buildTerminosEffect()).toEqual({
      kind: SendType.CONSENT,
      title: DOCUMENTOS_TITULO_TEXT,
      text: TERMINOS_PROMPT_TEXT,
      content: DATOS_PERSONALES_CONTENIDO,
      buttons: TERMINOS_BUTTONS,
      acceptLabel: "Continuar",
      checks: [
        { id: DocumentoAceptacion.TERMINOS, label: "Acepto los términos y condiciones" },
        { id: DocumentoAceptacion.DATOS_PERSONALES, label: "Autorizo el tratamiento de mis datos personales" },
      ],
      reopenLabel: "Revisar términos y datos personales",
      whatsappText: terminosWhatsappBodyText(TERMINOS_PROMPT_TEXT),
      withTerminosLink: true,
    });
    expect(DOCUMENTOS_CITA).toEqual([
      { documento: DocumentoAceptacion.TERMINOS, version: TERMINOS_VERSION },
      { documento: DocumentoAceptacion.DATOS_PERSONALES, version: DATOS_PERSONALES_VERSION },
    ]);
    expect([TERMINOS_VERSION, DATOS_PERSONALES_VERSION]).toEqual(["2026-10-29", "2026-11-03"]);
    expect(TERMINOS_BUTTONS.map((button) => button.title)).toEqual(["Acepto ambos", "No acepto"]);
  });
});

describe("every entry into «Agendar una cita médica» shows the terms first", () => {
  it("the menu row and then the document question after accepting", () => {
    const gated = shown(handle(mainMenu(), tap(MenuChoice.AGENDAR_CITA)));
    expectTerminos(gated, TerminosResume.ASK_DOCUMENTO);

    const resumed = accept(gated);

    expect(resumed.session.state).toBe(SessionState.CITA_AWAITING_DNI);
    expect(texts(resumed)).toEqual([ASK_DOCUMENTO_TEXT]);
    expect(resumed.session.slots[SlotKey.TERMINOS_ACEPTADOS]).toBe(true);
    expect(resumed.session.slots[SlotKey.TERMINOS_RESUME]).toBeUndefined();
    expect(resumed.session.slots[SlotKey.TERMINOS_INTRO_TEXT]).toBeUndefined();
  });

  it("«Cita sin referencia» in the references list shows the terms before the district", () => {
    const listed = verifiedReferencias(SessionState.CITA_AWAITING_REFERENCIA_SELECT);

    const gated = shown(handle(listed, tap(ReferenciaActionButtonId.NEW_APPOINTMENT)));
    expectTerminos(gated, TerminosResume.CONTINUE_VERIFIED);
    expect(gated.session.slots[SlotKey.CITA_BEARER]).toBe("synthetic-token");

    const resumed = acceptVerified(gated);
    expect(resumed.session.state).toBe(SessionState.CITA_AWAITING_DISTRITO_AI);
    expect(texts(resumed)).toEqual([VERIFIED_ASK_DISTRITO_TEXT]);
    expect(resumed.session.slots[SlotKey.CITA_BEARER]).toBe("synthetic-token");
  });

  it("the code check of a cita whose terms were not accepted yet shows them before the district", () => {
    const verifyPending: Session = {
      state: SessionState.CITA_VERIFY_PENDING,
      slots: { [SlotKey.CITA_DNI_PENDING]: DNI, [SlotKey.CITA_TWOFA_ID]: "twofa" },
      counters: {},
    };

    const gated = shown(handle(verifyPending, queryResult(QueryKind.VERIFY_CODE, { status: VerifyCodeStatus.VERIFIED, token: "token" })));

    expectTerminos(gated, TerminosResume.CONTINUE_VERIFIED);
    expect(gated.session.slots[SlotKey.CITA_DNI]).toBe(DNI);
  });
});

describe("«Cita con referencia» does not ask for the terms", () => {
  it("the menu row goes straight to the document", () => {
    const result = handle(mainMenu(), tap(MenuChoice.CONSULTAR_REFERENCIA));

    expect(result.session.state).toBe(SessionState.CITA_AWAITING_DNI);
    expect(texts(result)).toEqual([REFERENCIA_LOGIN_REQUIRED_TEXT]);
  });

  it("after the code it consults the references without the terms", () => {
    const verifyPending: Session = {
      state: SessionState.CITA_VERIFY_PENDING,
      slots: { [SlotKey.CITA_DNI_PENDING]: DNI, [SlotKey.CITA_TWOFA_ID]: "twofa", [SlotKey.POST_LOGIN_FLOW]: PostLoginFlow.REFERENCIAS },
      counters: {},
    };

    const result = handle(verifyPending, queryResult(QueryKind.VERIFY_CODE, { status: VerifyCodeStatus.VERIFIED, token: "token" }));

    expect(result.session.state).toBe(SessionState.REFERENCIA_LOOKUP_PENDING);
  });
});

describe("accepting", () => {
  it("records both documents with the channel, the service and each version in one query", () => {
    const gated = shown(handle(mainMenu(), tap(MenuChoice.AGENDAR_CITA)));

    const accepted = handle(gated.session, tap(TerminosButtonId.ACCEPT));

    expect(accepted.outcome).toBe(HandlerOutcome.AWAITING_QUERY);
    expect(sent(accepted)).toEqual([]);
    expect(queries(accepted)).toEqual([
      {
        kind: QueryKind.REGISTRAR_ACEPTACION_TERMINOS,
        payload: { canal: SessionChannel.WEB, flujo: FlujoAceptacion.CITA, documentos: DOCUMENTOS_CITA },
      },
    ]);
  });

  it("continues the cita even when the record could not be saved", () => {
    const gated = shown(handle(mainMenu(), tap(MenuChoice.AGENDAR_CITA)));
    const accepted = handle(gated.session, tap(TerminosButtonId.ACCEPT));

    const resumed = confirmCuentaMinsa(
      handle(accepted.session, queryResult(QueryKind.REGISTRAR_ACEPTACION_TERMINOS, { resultado: "failed" })),
      SessionChannel.WEB,
    );

    expect(resumed.session.state).toBe(SessionState.CITA_AWAITING_DNI);
    expect(texts(resumed)).toEqual([ASK_DOCUMENTO_TEXT]);
  });

  it("understands «acepto» written", () => {
    const gated = shown(handle(mainMenu(), tap(MenuChoice.AGENDAR_CITA)));

    expect(handle(gated.session, text("acepto")).session.state).toBe(SessionState.CITA_TERMINOS_REGISTER_PENDING);
  });

  it("does not ask again in the same session", () => {
    const resumed = accept(shown(handle(mainMenu(), tap(MenuChoice.AGENDAR_CITA))));
    const backToMenu = { ...resumed.session, state: SessionState.MAIN_MENU };

    const again = handle(backToMenu, tap(MenuChoice.AGENDAR_CITA));

    expect(again.session.state).toBe(SessionState.CITA_AWAITING_CUENTA_MINSA);
    expect(sent(again).some((effect) => effect.kind === SendType.CONSENT)).toBe(false);
  });
});

describe("terms accepted in an earlier conversation", () => {
  it("the same chat with the current version goes on without the terms", () => {
    const found = queryResult(QueryKind.CONSULTAR_ACEPTACION_TERMINOS, { resultado: AceptacionTerminosLookup.FOUND });

    const resumed = shown(handle(mainMenu(), tap(MenuChoice.AGENDAR_CITA)), found);

    expect(sent(resumed)).toEqual([cuentaMinsaAviso()]);
    expect(resumed.session.slots[SlotKey.TERMINOS_ACEPTADOS]).toBe(true);
    expect(resumed.session.slots[SlotKey.TERMINOS_RESUME]).toBeUndefined();
  });

  it("with the identity verified it goes on to the district", () => {
    const found = queryResult(QueryKind.CONSULTAR_ACEPTACION_TERMINOS, { resultado: AceptacionTerminosLookup.FOUND });

    const resumed = shown(
      handle(verifiedReferencias(SessionState.CITA_AWAITING_REFERENCIA_SELECT), tap(ReferenciaActionButtonId.NEW_APPOINTMENT)),
      found,
    );

    expect(resumed.session.state).toBe(SessionState.CITA_AWAITING_DISTRITO_AI);
    expect(texts(resumed)).toEqual([VERIFIED_ASK_DISTRITO_TEXT]);
  });

  it("a failed lookup shows the terms", () => {
    const lookup = queryResult(QueryKind.CONSULTAR_ACEPTACION_TERMINOS, { resultado: AceptacionTerminosLookup.FAILED });

    expectTerminos(shown(handle(mainMenu(), tap(MenuChoice.AGENDAR_CITA)), lookup), TerminosResume.ASK_DOCUMENTO);
  });
});

describe("declining", () => {
  it("«No acepto» says goodbye and closes the session", () => {
    const gated = shown(handle(mainMenu(), tap(MenuChoice.AGENDAR_CITA)));

    const result = handle(gated.session, tap(TerminosButtonId.DECLINE));

    expect(result.session).toEqual({ state: SessionState.CITA_TERMINOS_DECLINED, slots: {}, counters: {} });
    expect(result.outcome).toBe(HandlerOutcome.CLOSED);
    expect(texts(result)).toEqual([TERMINOS_RECHAZADOS_TEXT]);
    expect(queries(result)).toEqual([]);
  });

  it("drops the verified identity when it closes", () => {
    const gated = shown(
      handle(verifiedReferencias(SessionState.CITA_AWAITING_REFERENCIA_SELECT), tap(ReferenciaActionButtonId.NEW_APPOINTMENT)),
    );

    const result = handle(gated.session, tap(TerminosButtonId.DECLINE));

    expect(result.session.slots[SlotKey.CITA_BEARER]).toBeUndefined();
  });

  it("the next message after closing starts again from the first contact", () => {
    const gated = shown(handle(mainMenu(), tap(MenuChoice.AGENDAR_CITA)));
    const closed = handle(gated.session, tap(TerminosButtonId.DECLINE));

    const next = shown(handle(closed.session, text("cita")));

    expectTerminos(next, TerminosResume.ASK_DOCUMENTO);
  });
});

describe("anything else while the terms are shown", () => {
  it("«hola» shows the terms again with the usual notice", () => {
    const gated = shown(handle(mainMenu(), tap(MenuChoice.AGENDAR_CITA)));

    const result = handle(gated.session, text("hola"));

    expect(result.session.state).toBe(SessionState.CITA_AWAITING_TERMINOS);
    expect(result.session.slots).toEqual(gated.session.slots);
    expect(sent(result)).toEqual([{ kind: SendType.TEXT, text: FALLBACK_TEXT }, buildTerminosEffect()]);
  });

  it("a wish to leave asks for confirmation and «No» shows the terms again", () => {
    const gated = shown(handle(mainMenu(), tap(MenuChoice.AGENDAR_CITA)));

    const leaving = handle(gated.session, text("quiero salir"));
    expect(leaving.session.state).toBe(SessionState.CITA_AWAITING_EXIT_CONFIRM);

    const stayed = handle(leaving.session, tap(ExitButtonId.NO));
    expect(stayed.session.state).toBe(SessionState.CITA_AWAITING_TERMINOS);
    expect(sent(stayed).at(-1)).toEqual(buildTerminosEffect());
  });

  it("an insult gets the respect reminder and the terms again", () => {
    const gated = shown(handle(mainMenu(), tap(MenuChoice.AGENDAR_CITA)));

    const result = handle(gated.session, text("cojudos"));

    expect(result.session.state).toBe(SessionState.CITA_AWAITING_TERMINOS);
    expect(texts(result)).toContain(RESPECT_REMINDER_TEXT);
    expect(sent(result).at(-1)).toEqual(buildTerminosEffect());
  });
});

describe("with TERMINOS_ENABLED off", () => {
  it("goes straight to the document as before", () => {
    vi.stubEnv("TERMINOS_ENABLED", "false");

    const fromMenu = confirmCuentaMinsa(handle(mainMenu(), tap(MenuChoice.AGENDAR_CITA)), SessionChannel.WEB);
    const fromFirstContact = confirmCuentaMinsa(handleFirstContact("cita", SessionChannel.WEB), SessionChannel.WEB);

    expect(fromMenu.session.state).toBe(SessionState.CITA_AWAITING_DNI);
    expect(texts(fromMenu)).toEqual([ASK_DOCUMENTO_TEXT]);
    expect(fromFirstContact.session.state).toBe(SessionState.CITA_AWAITING_DNI);
    expect(texts(fromFirstContact)).toEqual([FIRST_CONTACT_CITA_TEXT]);
  });

  it("«Cita sin referencia» goes straight to the district", () => {
    vi.stubEnv("TERMINOS_ENABLED", "false");

    const result = handle(verifiedReferencias(SessionState.CITA_AWAITING_REFERENCIA_SELECT), tap(ReferenciaActionButtonId.NEW_APPOINTMENT));

    expect(result.session.state).toBe(SessionState.CITA_AWAITING_DISTRITO_AI);
    expect(texts(result)).toEqual([VERIFIED_ASK_DISTRITO_TEXT]);
  });

  it("a session left waiting for the terms still resumes when the flag is turned off", () => {
    const gated = shown(handle(mainMenu(), tap(MenuChoice.AGENDAR_CITA)));
    vi.stubEnv("TERMINOS_ENABLED", "false");

    const resumed = accept(gated);

    expect(resumed.session.state).toBe(SessionState.CITA_AWAITING_DNI);
  });
});

describe("a session saved without what to resume", () => {
  it("asks for the document", () => {
    const session: Session = {
      state: SessionState.CITA_TERMINOS_REGISTER_PENDING,
      slots: { [SlotKey.TERMINOS_ACEPTADOS]: true },
      counters: {},
    };
    const event: HandleEvent = queryResult(QueryKind.REGISTRAR_ACEPTACION_TERMINOS, { resultado: "saved" });

    const result = confirmCuentaMinsa(handle(session, event), SessionChannel.WEB);

    expect(result.session.state).toBe(SessionState.CITA_AWAITING_DNI);
    expect(texts(result)).toEqual([ASK_DOCUMENTO_TEXT]);
  });
});

describe("on WhatsApp the terms are only a link", () => {
  it("sends one text with the link and the document question, records nothing and skips the terms after the code", () => {
    vi.stubEnv("TERMINOS_URL", TERMINOS_URL);

    const result = handle(mainMenu(), tap(MenuChoice.AGENDAR_CITA, SessionChannel.WHATSAPP));

    expect(result.session.state).toBe(SessionState.CITA_AWAITING_DNI);
    expect(sent(result)).toEqual([{ kind: SendType.TEXT, text: terminosWhatsappAvisoText(TERMINOS_URL, WHATSAPP_ASK_DOCUMENTO_TEXT) }]);
    expect(queries(result)).toEqual([]);

    const listed = verifiedReferencias(SessionState.CITA_AWAITING_REFERENCIA_SELECT);
    const sinReferencia = handle(listed, tap(ReferenciaActionButtonId.NEW_APPOINTMENT, SessionChannel.WHATSAPP));
    expect(sinReferencia.session.state).toBe(SessionState.CITA_AWAITING_DISTRITO_AI);
  });

  it("the web keeps the consent with the same link configured", () => {
    vi.stubEnv("TERMINOS_URL", TERMINOS_URL);

    expectTerminos(shown(handle(mainMenu(), tap(MenuChoice.AGENDAR_CITA))), TerminosResume.ASK_DOCUMENTO);
  });
});
