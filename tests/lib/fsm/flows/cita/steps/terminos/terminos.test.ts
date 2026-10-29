import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { handle } from "@/lib/fsm/core/handlers";
import { isQueryEffect } from "@/lib/fsm/core/handlers-shared";
import { handleFirstContact } from "@/lib/fsm/routing/first-contact";
import { buildTerminosEffect } from "@/lib/fsm/flows/cita/steps/terminos/terminos-gate";
import type { HandleEvent, HandlerResult, InboundEvent, QueryResultEvent, SendEffect, Session } from "@/lib/fsm/core/types";
import type { ReferenciaItem } from "@/lib/integrations/minsa/types";
import { ASK_DOCUMENTO_TEXT } from "@/lib/constants/textos/identidad";
import { CITA_INTENT_DETECTED_TEXT, FIRST_CONTACT_CITA_TEXT, firstContactCitaRequestText } from "@/lib/constants/textos/menu";
import { VERIFIED_ASK_DISTRITO_TEXT } from "@/lib/constants/textos/cita-identidad";
import { REFERENCIA_LOGIN_REQUIRED_TEXT } from "@/lib/constants/textos/referencia";
import { CITA_WITH_WARNING_TEXT, RESPECT_REMINDER_TEXT } from "@/lib/constants/textos/seguridad";
import { FALLBACK_TEXT } from "@/lib/constants/textos/comunes";
import {
  TERMINOS_BUTTONS,
  TERMINOS_CONTENIDO,
  TERMINOS_PROMPT_TEXT,
  TERMINOS_RECHAZADOS_TEXT,
  TERMINOS_TITULO_TEXT,
  TERMINOS_VERSION,
} from "@/lib/constants/textos/terminos";
import { ExitButtonId } from "@/lib/enums/exit-button-id";
import { HandlerOutcome } from "@/lib/enums/handler-outcome";
import { InternalEventType } from "@/lib/enums/internal-event-type";
import { MainMenuIntent } from "@/lib/enums/main-menu-intent";
import { MenuChoice } from "@/lib/enums/menu-choice";
import { PostLoginFlow } from "@/lib/enums/post-login-flow";
import { QueryKind } from "@/lib/enums/query-kind";
import { ReferenciaActionButtonId } from "@/lib/enums/referencia-action-button-id";
import { ReferenciaCitaOfferButtonId } from "@/lib/enums/referencia-cita-offer-button-id";
import { SendType } from "@/lib/enums/send-type";
import { SessionChannel } from "@/lib/enums/session-channel";
import { SessionState } from "@/lib/enums/session-state";
import { SlotKey } from "@/lib/enums/slot-key";
import { TerminosButtonId } from "@/lib/enums/terminos-button-id";
import { TerminosResume } from "@/lib/enums/terminos-resume";
import { VerifyCodeStatus } from "@/lib/enums/verify-code-status";

const FROM = "synthetic-terminos";
const DNI = "12345678";
const CHANNELS = [SessionChannel.WHATSAPP, SessionChannel.WEB];

const text = (value: string, channel: SessionChannel = SessionChannel.WHATSAPP): InboundEvent => ({
  from: FROM,
  type: "text",
  text: value,
  channel,
});
const tap = (id: string, channel: SessionChannel = SessionChannel.WHATSAPP): InboundEvent => ({
  from: FROM,
  type: "button",
  listId: id,
  channel,
});
const queryResult = (queryKind: QueryKind, result: unknown): QueryResultEvent => ({
  from: FROM,
  type: InternalEventType.QUERY_RESULT,
  queryKind,
  result,
});
const sent = (result: HandlerResult): SendEffect[] => result.effects.filter((effect): effect is SendEffect => !isQueryEffect(effect));
const texts = (result: HandlerResult): string[] => sent(result).flatMap((effect) => (effect.kind === SendType.TEXT ? [effect.text] : []));
const queries = (result: HandlerResult) => result.effects.filter(isQueryEffect);
const mainMenu = (slots: Session["slots"] = {}): Session => ({ state: SessionState.MAIN_MENU, slots, counters: {} });

const REFERENCIA: ReferenciaItem = {
  idReferencia: "synthetic-ref",
  numero: "00123",
  fechaInicio: "24/07/2026 10:00",
  ipressOrigen: "CENTRO SINTÉTICO",
  ipressDestino: "HOSPITAL SINTÉTICO",
  upsOrigen: "MEDICINA GENERAL",
  upsDestino: "CARDIOLOGÍA",
  codigoIpressDestino: "5987",
  codigoUpsDestino: "222800",
  estado: 5,
};

function verifiedReferencias(state: Session["state"], slots: Session["slots"] = {}): Session {
  return {
    state,
    slots: {
      [SlotKey.CITA_BEARER]: "synthetic-token",
      [SlotKey.CITA_DNI]: DNI,
      [SlotKey.POST_LOGIN_FLOW]: PostLoginFlow.REFERENCIAS,
      [SlotKey.CITA_REFERENCIAS_DATA]: JSON.stringify([REFERENCIA]),
      ...slots,
    },
    counters: {},
  };
}

function expectTerminos(result: HandlerResult, resume: TerminosResume) {
  expect(result.session.state).toBe(SessionState.CITA_AWAITING_TERMINOS);
  expect(result.session.slots[SlotKey.TERMINOS_RESUME]).toBe(resume);
  expect(sent(result)).toEqual([buildTerminosEffect()]);
  expect(queries(result)).toEqual([]);
}

function accept(result: HandlerResult, channel: SessionChannel = SessionChannel.WHATSAPP): HandlerResult {
  const accepted = handle(result.session, tap(TerminosButtonId.ACCEPT, channel));
  expect(accepted.session.state).toBe(SessionState.CITA_TERMINOS_REGISTER_PENDING);
  return handle(accepted.session, queryResult(QueryKind.REGISTRAR_ACEPTACION_TERMINOS, { status: "saved" }));
}

beforeEach(() => {
  vi.stubEnv("TERMINOS_ENABLED", "true");
});

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("the terms message", () => {
  it("carries the title, a short question, the blank content and the Acepto / No acepto buttons", () => {
    expect(buildTerminosEffect()).toEqual({
      kind: SendType.TERMINOS,
      title: TERMINOS_TITULO_TEXT,
      text: TERMINOS_PROMPT_TEXT,
      content: TERMINOS_CONTENIDO,
      buttons: TERMINOS_BUTTONS,
    });
    expect(TERMINOS_CONTENIDO).toBe("");
    expect(TERMINOS_VERSION).toBe("2026-10-29");
    expect(TERMINOS_BUTTONS.map((button) => button.title)).toEqual(["Acepto", "No acepto"]);
  });
});

describe("every entry into «Agendar una cita médica» shows the terms first", () => {
  it.each(CHANNELS)("the menu row (%s) and then the document question after accepting", (channel) => {
    const gated = handle(mainMenu(), tap(MenuChoice.AGENDAR_CITA, channel));
    expectTerminos(gated, TerminosResume.ASK_DOCUMENTO);

    const resumed = accept(gated, channel);

    expect(resumed.session.state).toBe(SessionState.CITA_AWAITING_DNI);
    expect(texts(resumed)).toEqual([ASK_DOCUMENTO_TEXT]);
    expect(resumed.session.slots[SlotKey.TERMINOS_ACEPTADOS]).toBe(true);
    expect(resumed.session.slots[SlotKey.TERMINOS_RESUME]).toBeUndefined();
    expect(resumed.session.slots[SlotKey.TERMINOS_INTRO_TEXT]).toBeUndefined();
  });

  it.each(CHANNELS)("the «cita» keyword at first contact (%s)", (channel) => {
    const gated = handleFirstContact("cita", channel);
    expectTerminos(gated, TerminosResume.ASK_DOCUMENTO);

    expect(texts(accept(gated, channel))).toEqual([FIRST_CONTACT_CITA_TEXT]);
  });

  it("a first-contact request keeps the specialty and the district for after the terms", () => {
    const gated = handleFirstContact("quiero cita de pediatría en San Borja", SessionChannel.WHATSAPP);
    expectTerminos(gated, TerminosResume.ASK_DOCUMENTO);
    expect(gated.session.slots[SlotKey.CITA_ESPECIALIDAD_HINT_TEXT]).toBe("Pediatría");
    expect(gated.session.slots[SlotKey.CITA_DISTRITO_HINT_TEXT]).toBe("San Borja");

    const resumed = accept(gated);

    expect(resumed.session.state).toBe(SessionState.CITA_AWAITING_DNI);
    expect(texts(resumed)).toEqual([firstContactCitaRequestText(" de Pediatría", " en San Borja")]);
    expect(resumed.session.slots[SlotKey.CITA_ESPECIALIDAD_HINT_TEXT]).toBe("Pediatría");
    expect(resumed.session.slots[SlotKey.CITA_DISTRITO_HINT_TEXT]).toBe("San Borja");
  });

  it("the cita detected by the AI keeps what it understood", () => {
    const pending: Session = { state: SessionState.MAIN_MENU_INTENT_PENDING, slots: {}, counters: {} };

    const gated = handle(
      pending,
      queryResult(QueryKind.ANALYZE_MAIN_MENU_INTENT, { intent: MainMenuIntent.CITA, especialidad: "Odontología" }),
    );
    expectTerminos(gated, TerminosResume.ASK_DOCUMENTO);

    const resumed = accept(gated);
    expect(texts(resumed)).toEqual([CITA_INTENT_DETECTED_TEXT]);
    expect(resumed.session.slots[SlotKey.CITA_ESPECIALIDAD_HINT_TEXT]).toBe("Odontología");
  });

  it("a cita asked with an insult keeps the warning for after the terms", () => {
    const gated = handle(mainMenu(), text("Apúrense cojudos quiero cita de odontología en San Borja"));
    expectTerminos(gated, TerminosResume.ASK_DOCUMENTO);

    expect(texts(accept(gated))).toEqual([CITA_WITH_WARNING_TEXT]);
  });

  it.each(CHANNELS)("«Cita sin referencia» in the references list (%s) shows the terms before the district", (channel) => {
    const listed = verifiedReferencias(SessionState.CITA_AWAITING_REFERENCIA_SELECT);

    const gated = handle(listed, tap(ReferenciaActionButtonId.NEW_APPOINTMENT, channel));
    expectTerminos(gated, TerminosResume.CONTINUE_VERIFIED);
    expect(gated.session.slots[SlotKey.CITA_BEARER]).toBe("synthetic-token");

    const resumed = accept(gated, channel);
    expect(resumed.session.state).toBe(SessionState.CITA_AWAITING_DISTRITO_AI);
    expect(texts(resumed)).toEqual([VERIFIED_ASK_DISTRITO_TEXT]);
    expect(resumed.session.slots[SlotKey.CITA_BEARER]).toBe("synthetic-token");
  });

  it("«Sí» to the cita offer of the references flow also shows the terms first", () => {
    const offer = verifiedReferencias(SessionState.REFERENCIA_AWAITING_CITA_OFFER);

    expectTerminos(handle(offer, tap(ReferenciaCitaOfferButtonId.YES)), TerminosResume.CONTINUE_VERIFIED);
  });

  it("the code check of a cita whose terms were not accepted yet shows them before the district", () => {
    const verifyPending: Session = {
      state: SessionState.CITA_VERIFY_PENDING,
      slots: { [SlotKey.CITA_DNI_PENDING]: DNI, [SlotKey.CITA_TWOFA_ID]: "twofa" },
      counters: {},
    };

    const gated = handle(verifyPending, queryResult(QueryKind.VERIFY_CODE, { status: VerifyCodeStatus.VERIFIED, token: "token" }));

    expectTerminos(gated, TerminosResume.CONTINUE_VERIFIED);
    expect(gated.session.slots[SlotKey.CITA_DNI]).toBe(DNI);
  });
});

describe("«Cita con referencia» does not ask for the terms", () => {
  it.each(CHANNELS)("the menu row (%s) goes straight to the document", (channel) => {
    const result = handle(mainMenu(), tap(MenuChoice.CONSULTAR_REFERENCIA, channel));

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
  it.each(CHANNELS)("records the acceptance with the channel (%s) and the version", (channel) => {
    const gated = handle(mainMenu(), tap(MenuChoice.AGENDAR_CITA, channel));

    const accepted = handle(gated.session, tap(TerminosButtonId.ACCEPT, channel));

    expect(accepted.outcome).toBe(HandlerOutcome.AWAITING_QUERY);
    expect(sent(accepted)).toEqual([]);
    expect(queries(accepted)).toEqual([
      { kind: QueryKind.REGISTRAR_ACEPTACION_TERMINOS, payload: { canal: channel, version: TERMINOS_VERSION } },
    ]);
  });

  it("continues the cita even when the record could not be saved", () => {
    const gated = handle(mainMenu(), tap(MenuChoice.AGENDAR_CITA));
    const accepted = handle(gated.session, tap(TerminosButtonId.ACCEPT));

    const resumed = handle(accepted.session, queryResult(QueryKind.REGISTRAR_ACEPTACION_TERMINOS, { status: "failed" }));

    expect(resumed.session.state).toBe(SessionState.CITA_AWAITING_DNI);
    expect(texts(resumed)).toEqual([ASK_DOCUMENTO_TEXT]);
  });

  it.each(["acepto", "Sí, acepto", "si acepto", "ACEPTO", "1"])("understands %j written", (answer) => {
    const gated = handle(mainMenu(), tap(MenuChoice.AGENDAR_CITA));

    expect(handle(gated.session, text(answer)).session.state).toBe(SessionState.CITA_TERMINOS_REGISTER_PENDING);
  });

  it("does not ask again in the same session", () => {
    const resumed = accept(handle(mainMenu(), tap(MenuChoice.AGENDAR_CITA)));
    const backToMenu = { ...resumed.session, state: SessionState.MAIN_MENU };

    const again = handle(backToMenu, tap(MenuChoice.AGENDAR_CITA));

    expect(again.session.state).toBe(SessionState.CITA_AWAITING_DNI);
    expect(sent(again).some((effect) => effect.kind === SendType.TERMINOS)).toBe(false);
  });
});

describe("declining", () => {
  it.each([tap(TerminosButtonId.DECLINE), text("no acepto"), text("No acepto."), text("2")])(
    "%j says goodbye and closes the session",
    (event) => {
      const gated = handle(mainMenu(), tap(MenuChoice.AGENDAR_CITA));

      const result = handle(gated.session, event);

      expect(result.session).toEqual({ state: SessionState.CITA_TERMINOS_DECLINED, slots: {}, counters: {} });
      expect(result.outcome).toBe(HandlerOutcome.CLOSED);
      expect(texts(result)).toEqual([TERMINOS_RECHAZADOS_TEXT]);
      expect(TERMINOS_RECHAZADOS_TEXT.startsWith("Lo sentimos. Muchas gracias por usar nuestros servicios.")).toBe(true);
      expect(queries(result)).toEqual([]);
    },
  );

  it("drops the verified identity when it closes", () => {
    const gated = handle(verifiedReferencias(SessionState.CITA_AWAITING_REFERENCIA_SELECT), tap(ReferenciaActionButtonId.NEW_APPOINTMENT));

    const result = handle(gated.session, tap(TerminosButtonId.DECLINE));

    expect(result.session.slots[SlotKey.CITA_BEARER]).toBeUndefined();
  });

  it("the next message after closing starts again from the first contact", () => {
    const gated = handle(mainMenu(), tap(MenuChoice.AGENDAR_CITA));
    const closed = handle(gated.session, tap(TerminosButtonId.DECLINE));

    const next = handle(closed.session, text("cita"));

    expectTerminos(next, TerminosResume.ASK_DOCUMENTO);
  });
});

describe("anything else while the terms are shown", () => {
  it.each(["no entiendo", "12345678", "hola"])("%j shows the terms again with the usual notice", (answer) => {
    const gated = handle(mainMenu(), tap(MenuChoice.AGENDAR_CITA));

    const result = handle(gated.session, text(answer));

    expect(result.session.state).toBe(SessionState.CITA_AWAITING_TERMINOS);
    expect(result.session.slots).toEqual(gated.session.slots);
    expect(sent(result)).toEqual([{ kind: SendType.TEXT, text: FALLBACK_TEXT }, buildTerminosEffect()]);
  });

  it("a wish to leave asks for confirmation and «No» shows the terms again", () => {
    const gated = handle(mainMenu(), tap(MenuChoice.AGENDAR_CITA));

    const leaving = handle(gated.session, text("quiero salir"));
    expect(leaving.session.state).toBe(SessionState.CITA_AWAITING_EXIT_CONFIRM);

    const stayed = handle(leaving.session, tap(ExitButtonId.NO));
    expect(stayed.session.state).toBe(SessionState.CITA_AWAITING_TERMINOS);
    expect(sent(stayed).at(-1)).toEqual(buildTerminosEffect());
  });

  it("an insult gets the respect reminder and the terms again", () => {
    const gated = handle(mainMenu(), tap(MenuChoice.AGENDAR_CITA));

    const result = handle(gated.session, text("cojudos"));

    expect(result.session.state).toBe(SessionState.CITA_AWAITING_TERMINOS);
    expect(texts(result)).toContain(RESPECT_REMINDER_TEXT);
    expect(sent(result).at(-1)).toEqual(buildTerminosEffect());
  });
});

describe("with TERMINOS_ENABLED off", () => {
  it.each(["false", "", undefined])("TERMINOS_ENABLED=%j goes straight to the document as before", (value) => {
    vi.stubEnv("TERMINOS_ENABLED", value);

    const fromMenu = handle(mainMenu(), tap(MenuChoice.AGENDAR_CITA));
    const fromFirstContact = handleFirstContact("cita", SessionChannel.WEB);

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
    const gated = handle(mainMenu(), tap(MenuChoice.AGENDAR_CITA));
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
    const event: HandleEvent = queryResult(QueryKind.REGISTRAR_ACEPTACION_TERMINOS, { status: "saved" });

    const result = handle(session, event);

    expect(result.session.state).toBe(SessionState.CITA_AWAITING_DNI);
    expect(texts(result)).toEqual([ASK_DOCUMENTO_TEXT]);
  });
});
