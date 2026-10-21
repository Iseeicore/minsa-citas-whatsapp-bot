import { describe, expect, it } from "vitest";
import { handle } from "@/lib/fsm/core/handlers";
import { isQueryEffect } from "@/lib/fsm/core/handlers-shared";
import { handleReferencia } from "@/lib/fsm/flows/referencia/handlers-referencia";
import { UnknownStateError } from "@/lib/errors/unknown-state-error";
import { ANALYZING_CUENTA_TEXT, VERIFIED_ASK_DISTRITO_TEXT } from "@/lib/constants/textos/cita-identidad";
import { REFERENCIAS_LIST_TEXT } from "@/lib/constants/textos/cita-reserva";
import {
  REFERENCIA_CITA_OFFER_BUTTONS,
  REFERENCIA_CITA_OFFER_QUESTION_TEXT,
  REFERENCIA_GOODBYE_TEXT,
  REFERENCIA_LOOKUP_FAILED_TEXT,
  REFERENCIA_NONE_TEXT,
} from "@/lib/constants/textos/referencia";
import { FALLBACK_TEXT } from "@/lib/constants/textos/comunes";
import { DEMO_PEDIATRIA_DNI, DEMO_REFERENCIA_DNI } from "@/lib/fsm/flows/cita/steps/demo/demo-referencia";
import type { HandlerResult, InboundEvent, QueryResultEvent, SendEffect, Session } from "@/lib/fsm/core/types";
import type { ReferenciaItem } from "@/lib/integrations/minsa/types";
import { HandlerOutcome } from "@/lib/enums/handler-outcome";
import { InternalEventType } from "@/lib/enums/internal-event-type";
import { PostLoginFlow } from "@/lib/enums/post-login-flow";
import { QueryKind } from "@/lib/enums/query-kind";
import { ReferenceStatus } from "@/lib/enums/reference-status";
import { ReferenciaCitaOfferButtonId } from "@/lib/enums/referencia-cita-offer-button-id";
import { SessionState } from "@/lib/enums/session-state";
import { SlotKey } from "@/lib/enums/slot-key";

const FROM = "sandbox-referencia-flow";
const DNI = "12345678";

const text = (value: string): InboundEvent => ({ from: FROM, type: "text", text: value });
const tap = (id: string): InboundEvent => ({ from: FROM, type: "button", listId: id });
const queryResult = (queryKind: QueryKind, result: unknown): QueryResultEvent => ({
  from: FROM,
  type: InternalEventType.QUERY_RESULT,
  queryKind,
  result,
});

const sent = (result: HandlerResult): SendEffect[] => result.effects.filter((effect): effect is SendEffect => !isQueryEffect(effect));
const texts = (result: HandlerResult): string[] => sent(result).flatMap((effect) => (effect.kind === "send_text" ? [effect.text] : []));
const queries = (result: HandlerResult) => result.effects.filter(isQueryEffect);
const buttons = (result: HandlerResult) => {
  const found = sent(result).find((effect) => effect.kind === "send_buttons");
  return found?.kind === "send_buttons" ? found : undefined;
};

const REFERENCIA: ReferenciaItem = {
  idReferencia: "1364486",
  numero: "00123",
  fechaInicio: "24/07/2024 23:03",
  ipressOrigen: "SAN FERNANDO",
  ipressDestino: "HOSPITAL MARIA AUXILIADORA",
  upsOrigen: "MEDICINA GENERAL",
  upsDestino: "GASTROENTEROLOGÍA",
  codigoIpressDestino: "5987",
  codigoUpsDestino: "222800",
  estado: 7,
};

function verifyPending(dni: string, slots: Session["slots"] = {}): Session {
  return {
    state: SessionState.CITA_VERIFY_PENDING,
    slots: { [SlotKey.CITA_DNI_PENDING]: dni, [SlotKey.CITA_TWOFA_ID]: "twofa", ...slots },
    counters: {},
  };
}

const verified = queryResult(QueryKind.VERIFY_CODE, { status: "verified", token: "token-real" });

function lookupPending(): Session {
  return {
    state: SessionState.REFERENCIA_LOOKUP_PENDING,
    slots: { [SlotKey.CITA_BEARER]: "token-real", [SlotKey.CITA_DNI]: DNI, [SlotKey.POST_LOGIN_FLOW]: PostLoginFlow.REFERENCIAS },
    counters: {},
  };
}

function citaOffer(): Session {
  return { ...lookupPending(), state: SessionState.REFERENCIA_AWAITING_CITA_OFFER };
}

describe("after the OTP: the purpose decides what comes next", () => {
  it("referencias: looks the referencias up by document, with no code asked", () => {
    const result = handle(verifyPending(DNI, { [SlotKey.POST_LOGIN_FLOW]: PostLoginFlow.REFERENCIAS }), verified);

    expect(result.session.state).toBe(SessionState.REFERENCIA_LOOKUP_PENDING);
    expect(result.session.slots[SlotKey.CITA_BEARER]).toBe("token-real");
    expect(result.session.slots[SlotKey.CITA_DNI]).toBe(DNI);
    expect(result.session.slots[SlotKey.POST_LOGIN_FLOW]).toBe(PostLoginFlow.REFERENCIAS);
    expect(texts(result)).toEqual([ANALYZING_CUENTA_TEXT]);
    expect(queries(result)).toEqual([{ kind: QueryKind.LIST_REFERENCES, payload: { numeroDocumento: DNI, tipoDocumento: "01" } }]);
    expect(result.outcome).toBe(HandlerOutcome.AWAITING_QUERY);
  });

  it("cita (no purpose): goes straight to the distrito and never looks the referencias up", () => {
    const result = handle(verifyPending(DNI), verified);

    expect(result.session.state).toBe(SessionState.CITA_AWAITING_DISTRITO_AI);
    expect(texts(result)).toEqual([VERIFIED_ASK_DISTRITO_TEXT]);
    expect(queries(result)).toEqual([]);
    expect(result.session.slots[SlotKey.CITA_BEARER]).toBe("token-real");
  });

  it.each([DEMO_REFERENCIA_DNI, DEMO_PEDIATRIA_DNI])("the demo document %s only reaches the demo under the referencias purpose", (dni) => {
    const demo = handle(verifyPending(dni, { [SlotKey.POST_LOGIN_FLOW]: PostLoginFlow.REFERENCIAS }), verified);
    expect(demo.session.state).toBe(SessionState.CITA_DEMO_AWAITING_REFERENCIA_SELECT);
    expect(demo.session.slots[SlotKey.POST_LOGIN_FLOW]).toBeUndefined();
    expect(queries(demo)).toEqual([]);

    const cita = handle(verifyPending(dni), verified);
    expect(cita.session.state).toBe(SessionState.CITA_AWAITING_DISTRITO_AI);
  });

  it("a wrong code keeps the purpose for the next try", () => {
    const result = handle(
      verifyPending(DNI, { [SlotKey.POST_LOGIN_FLOW]: PostLoginFlow.REFERENCIAS }),
      queryResult(QueryKind.VERIFY_CODE, { status: "invalid" }),
    );

    expect(result.session.state).toBe(SessionState.CITA_AWAITING_OTP);
    expect(result.session.slots[SlotKey.POST_LOGIN_FLOW]).toBe(PostLoginFlow.REFERENCIAS);
  });
});

describe("the lookup", () => {
  it("with referencias: lists them straight away, with the existing list", () => {
    const result = handle(
      lookupPending(),
      queryResult(QueryKind.LIST_REFERENCES, { statusReference: ReferenceStatus.FOUND, message: "", data: [REFERENCIA] }),
    );

    expect(result.session.state).toBe(SessionState.CITA_AWAITING_REFERENCIA_SELECT);
    const list = sent(result).find((effect) => effect.kind === "send_interactive_list");
    expect(list).toMatchObject({ text: REFERENCIAS_LIST_TEXT });
    expect(list?.kind === "send_interactive_list" && list.rows.map((row) => row.id)).toEqual(["1364486"]);
    expect(list?.kind === "send_interactive_list" && list.rows[0]).toEqual({
      id: "1364486",
      title: "HOSPITAL MARIA AUXILIAD…",
      description: "24/07/2024 11:03 PM · SAN FERNANDO",
    });
    expect(result.session.slots[SlotKey.CITA_REFERENCIAS_DATA]).toBe(JSON.stringify([REFERENCIA]));
    expect(result.session.slots[SlotKey.POST_LOGIN_FLOW]).toBe(PostLoginFlow.REFERENCIAS);
  });

  it.each([ReferenceStatus.EMPTY, "otro"])("without referencias (%s): says so and offers a cita, with no list", (statusReference) => {
    const result = handle(lookupPending(), queryResult(QueryKind.LIST_REFERENCES, { statusReference, message: "", data: [] }));

    expect(result.session.state).toBe(SessionState.REFERENCIA_AWAITING_CITA_OFFER);
    expect(texts(result)).toEqual([REFERENCIA_NONE_TEXT]);
    expect(buttons(result)).toEqual({
      kind: "send_buttons",
      text: REFERENCIA_CITA_OFFER_QUESTION_TEXT,
      buttons: REFERENCIA_CITA_OFFER_BUTTONS,
    });
    expect(result.session.slots[SlotKey.CITA_BEARER]).toBe("token-real");
  });

  it("when the lookup fails: says it could not check, not that there are none, and still offers a cita", () => {
    const result = handle(
      lookupPending(),
      queryResult(QueryKind.LIST_REFERENCES, { statusReference: ReferenceStatus.ERROR, message: "", data: [] }),
    );

    expect(result.session.state).toBe(SessionState.REFERENCIA_AWAITING_CITA_OFFER);
    expect(texts(result)).toEqual([REFERENCIA_LOOKUP_FAILED_TEXT]);
    expect(texts(result)).not.toContain(REFERENCIA_NONE_TEXT);
    expect(buttons(result)).toEqual({
      kind: "send_buttons",
      text: REFERENCIA_CITA_OFFER_QUESTION_TEXT,
      buttons: REFERENCIA_CITA_OFFER_BUTTONS,
    });
    expect(result.session.slots[SlotKey.CITA_REFERENCIAS_DATA]).toBeUndefined();
  });

  it("the lookup failure text is the agreed wording", () => {
    expect(REFERENCIA_LOOKUP_FAILED_TEXT).toBe("No pudimos consultar tus referencias en este momento. Inténtalo de nuevo más tarde.");
  });

  it("found with no referencias left is treated as no referencias, never an empty list", () => {
    const result = handle(
      lookupPending(),
      queryResult(QueryKind.LIST_REFERENCES, { statusReference: ReferenceStatus.FOUND, message: "", data: [] }),
    );

    expect(result.session.state).toBe(SessionState.REFERENCIA_AWAITING_CITA_OFFER);
    expect(texts(result)).toEqual([REFERENCIA_NONE_TEXT]);
    expect(sent(result).some((effect) => effect.kind === "send_interactive_list")).toBe(false);
    expect(result.session.slots[SlotKey.CITA_REFERENCIAS_DATA]).toBeUndefined();
  });

  it("the offer buttons use their own ids", () => {
    expect(REFERENCIA_CITA_OFFER_BUTTONS.map((button) => button.id)).toEqual([
      ReferenciaCitaOfferButtonId.YES,
      ReferenciaCitaOfferButtonId.NO,
    ]);
    expect(ReferenciaCitaOfferButtonId.YES).toBe("referencia_cita_offer_si");
    expect(ReferenciaCitaOfferButtonId.NO).toBe("referencia_cita_offer_no");
  });
});

describe("without referencias: the offer of a cita", () => {
  it.each([
    ["the yes button", tap(ReferenciaCitaOfferButtonId.YES)],
    ["a typed yes", text("sí")],
  ])("%s continues the cita with the identity already verified, no document and no code again", (_name, event) => {
    const result = handle(citaOffer(), event);

    expect(result.session.state).toBe(SessionState.CITA_AWAITING_DISTRITO_AI);
    expect(texts(result)).toEqual([VERIFIED_ASK_DISTRITO_TEXT]);
    expect(queries(result)).toEqual([]);
    expect(result.session.slots[SlotKey.CITA_BEARER]).toBe("token-real");
    expect(result.session.slots[SlotKey.CITA_DNI]).toBe(DNI);
    expect(result.session.slots[SlotKey.POST_LOGIN_FLOW]).toBeUndefined();
  });

  it.each([
    ["the no button", tap(ReferenciaCitaOfferButtonId.NO)],
    ["a typed no", text("no")],
  ])("%s says goodbye kindly and closes", (_name, event) => {
    const result = handle(citaOffer(), event);

    expect(result.session.state).toBe(SessionState.REFERENCIA_CLOSED);
    expect(texts(result)).toEqual([REFERENCIA_GOODBYE_TEXT]);
    expect(result.outcome).toBe(HandlerOutcome.CLOSED);
    expect(result.session.slots[SlotKey.CITA_BEARER]).toBeUndefined();
  });

  it("an unclear answer asks again", () => {
    const result = handle(citaOffer(), text("mmm no se"));

    expect(result.session.state).toBe(SessionState.REFERENCIA_AWAITING_CITA_OFFER);
    expect(texts(result)).toEqual([FALLBACK_TEXT]);
    expect(buttons(result)?.text).toBe(REFERENCIA_CITA_OFFER_QUESTION_TEXT);
  });

  it("after the goodbye, the next message starts over from the first contact", () => {
    const closed = handle(citaOffer(), text("no")).session;

    const next = handle(closed, text("hola"));

    expect(next.session.state).toBe(SessionState.MAIN_MENU);
    expect(next.session.slots).toEqual({});
  });

  it("a dispatcher that receives a state that is not its own fails loudly", () => {
    expect(() => handleReferencia({ ...citaOffer(), state: SessionState.REFERENCIA_CLOSED }, text("hola"))).toThrow(UnknownStateError);
  });
});

describe("with referencias: the existing selection and confirmation", () => {
  function confirmPending(): Session {
    return {
      state: SessionState.CITA_AWAITING_REFERENCIA_CONFIRM,
      slots: {
        [SlotKey.CITA_BEARER]: "token-real",
        [SlotKey.CITA_DNI]: DNI,
        [SlotKey.POST_LOGIN_FLOW]: PostLoginFlow.REFERENCIAS,
        [SlotKey.CITA_REFERENCIAS_DATA]: JSON.stringify([REFERENCIA]),
        [SlotKey.CITA_REFERENCIA_SELECCIONADA_ID]: "1364486",
      },
      counters: {},
    };
  }

  it("confirming books with that referencia and leaves the purpose behind", () => {
    const result = handle(confirmPending(), text("si"));

    expect(result.session.state).toBe(SessionState.CITA_FECHA_PENDING);
    expect(result.session.slots[SlotKey.CITA_REFERENCIA_SELECCIONADA_ID]).toBe("1364486");
    expect(result.session.slots[SlotKey.POST_LOGIN_FLOW]).toBeUndefined();
    expect(queries(result)).toEqual([{ kind: QueryKind.LIST_FECHAS, payload: { codEess: "5987", especialidadId: "222800" } }]);
  });

  it("a referencia without destination codes continues the normal cita and leaves the purpose behind", () => {
    const session = confirmPending();
    session.slots[SlotKey.CITA_REFERENCIAS_DATA] = JSON.stringify([{ ...REFERENCIA, codigoIpressDestino: "", codigoUpsDestino: "" }]);

    const result = handle(session, text("si"));

    expect(result.session.state).toBe(SessionState.CITA_AWAITING_DISTRITO_AI);
    expect(result.session.slots[SlotKey.POST_LOGIN_FLOW]).toBeUndefined();
  });

  it("asking for another one keeps the purpose", () => {
    const result = handle(confirmPending(), text("no"));

    expect(result.session.state).toBe(SessionState.CITA_AWAITING_REFERENCIA_SELECT);
    expect(result.session.slots[SlotKey.POST_LOGIN_FLOW]).toBe(PostLoginFlow.REFERENCIAS);
  });
});
