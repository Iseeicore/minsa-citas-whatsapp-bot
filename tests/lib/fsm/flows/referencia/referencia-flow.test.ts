import { describe, expect, it } from "vitest";
import { handle } from "@/lib/fsm/core/handlers";
import { isQueryEffect } from "@/lib/fsm/core/handlers-shared";
import { handleReferencia } from "@/lib/fsm/flows/referencia/handlers-referencia";
import { UnknownStateError } from "@/lib/errors/unknown-state-error";
import { REVERIFICATION_PROMPT_TEXT, VERIFIED_ASK_DISTRITO_TEXT } from "@/lib/constants/textos/cita-identidad";
import { CONSULTA_REFERENCIAS_ACTIONS, consultaReferenciasListText } from "@/lib/constants/textos/cita-referencia";
import { ReferenciaActionButtonId } from "@/lib/enums/referencia-action-button-id";
import { ListPageButtonId } from "@/lib/enums/list-page-button-id";
import { SessionChannel } from "@/lib/enums/session-channel";
import {
  REFERENCIA_CITA_OFFER_BUTTONS,
  REFERENCIA_CITA_OFFER_QUESTION_TEXT,
  REFERENCIA_CONSULTA_FALLIDA_TEXT,
  REFERENCIA_GOODBYE_TEXT,
  REFERENCIA_LOGIN_REQUIRED_TEXT,
  REFERENCIA_NONE_TEXT,
  REFERENCIA_SIN_AGENDABLES_TEXT,
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

const text = (value: string): InboundEvent => ({ channel: "whatsapp", from: FROM, type: "text", text: value });
const tap = (id: string): InboundEvent => ({ channel: "whatsapp", from: FROM, type: "button", listId: id });
const queryResult = (queryKind: QueryKind, result: unknown, channel: SessionChannel = SessionChannel.WHATSAPP): QueryResultEvent => ({
  from: FROM,
  type: InternalEventType.QUERY_RESULT,
  queryKind,
  result,
  channel,
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
  estado: 5,
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
    expect(texts(result)).toEqual([]);
    expect(queries(result)).toEqual([{ kind: QueryKind.LIST_REFERENCES, payload: { numeroDocumento: DNI, tipoDocumento: "01" } }]);
    expect(result.outcome).toBe(HandlerOutcome.AWAITING_QUERY);
  });

  it("cita (no purpose): asks for the district without consulting references", () => {
    const result = handle(verifyPending(DNI), verified);

    expect(result.session.state).toBe(SessionState.CITA_AWAITING_DISTRITO_AI);
    expect(texts(result)).toEqual([VERIFIED_ASK_DISTRITO_TEXT]);
    expect(queries(result)).toEqual([]);
    expect(result.session.slots[SlotKey.CITA_BEARER]).toBe("token-real");
    expect(result.session.slots[SlotKey.CITA_DNI]).toBe(DNI);
    expect(result.session.slots[SlotKey.POST_LOGIN_FLOW]).toBeUndefined();
  });

  it.each([DEMO_REFERENCIA_DNI, DEMO_PEDIATRIA_DNI])("the demo document %s only reaches the demo under the referencias purpose", (dni) => {
    const demo = handle(verifyPending(dni, { [SlotKey.POST_LOGIN_FLOW]: PostLoginFlow.REFERENCIAS }), verified);
    expect(demo.session.state).toBe(SessionState.CITA_DEMO_AWAITING_REFERENCIA_SELECT);
    expect(demo.session.slots[SlotKey.POST_LOGIN_FLOW]).toBeUndefined();
    expect(queries(demo)).toEqual([]);

    const cita = handle(verifyPending(dni), verified);
    expect(cita.session.state).toBe(SessionState.CITA_AWAITING_DISTRITO_AI);
    expect(queries(cita)).toEqual([]);
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
    expect(list).toMatchObject({ text: consultaReferenciasListText(["ACEPTADO", "PACIENTE RECIBIDO"]) });
    expect(list?.kind === "send_interactive_list" && list.rows.map((row) => row.id)).toEqual(["1364486"]);
    expect(list?.kind === "send_interactive_list" && list.rows[0]).toEqual({
      id: "1364486",
      title: "GASTROENTEROLOGÍA",
      description: "HOSPITAL MARIA AUXILIADORA · N° 00123 · 24/07/2024 · PACIENTE RECIBIDO",
    });
    expect(result.session.slots[SlotKey.CITA_REFERENCIAS_DATA]).toBe(JSON.stringify([REFERENCIA]));
    expect(result.session.slots[SlotKey.POST_LOGIN_FLOW]).toBe(PostLoginFlow.REFERENCIAS);
  });

  it.each([
    [ReferenceStatus.EMPTY, REFERENCIA_NONE_TEXT],
    [ReferenceStatus.ERROR, REFERENCIA_CONSULTA_FALLIDA_TEXT],
    [ReferenceStatus.UNAVAILABLE, REFERENCIA_CONSULTA_FALLIDA_TEXT],
    ["otro", REFERENCIA_CONSULTA_FALLIDA_TEXT],
  ])("without referencias (%s): says why and offers a cita, with no list", (statusReference, aviso) => {
    const result = handle(lookupPending(), queryResult(QueryKind.LIST_REFERENCES, { statusReference, message: "", data: [] }));

    expect(result.session.state).toBe(SessionState.REFERENCIA_AWAITING_CITA_OFFER);
    expect(texts(result)).toEqual([aviso]);
    expect(buttons(result)).toEqual({
      kind: "send_buttons",
      text: REFERENCIA_CITA_OFFER_QUESTION_TEXT,
      buttons: REFERENCIA_CITA_OFFER_BUTTONS,
    });
    expect(result.session.slots[SlotKey.CITA_BEARER]).toBe("token-real");
  });

  it("an expired session asks to verify again and, once verified, repeats the lookup", () => {
    const expired = handle(
      lookupPending(),
      queryResult(QueryKind.LIST_REFERENCES, { statusReference: ReferenceStatus.UNAUTHORIZED, message: "", data: [] }),
    );

    expect(expired.session.state).toBe(SessionState.CITA_AWAITING_DNI);
    expect(expired.session.slots[SlotKey.CITA_BEARER]).toBeUndefined();
    expect(texts(expired)).toEqual([REVERIFICATION_PROMPT_TEXT]);

    const again = handle(verifyPending(DNI, expired.session.slots), verified);

    expect(again.session.state).toBe(SessionState.REFERENCIA_LOOKUP_PENDING);
    expect(again.session.slots[SlotKey.CITA_RESUME_STATE]).toBeUndefined();
    expect(queries(again)).toEqual([{ kind: QueryKind.LIST_REFERENCES, payload: { numeroDocumento: DNI, tipoDocumento: "01" } }]);
  });

  describe("with references that do not allow booking", () => {
    const citada: ReferenciaItem = { ...REFERENCIA, idReferencia: "citada", numero: "00777", upsDestino: "OFTALMOLOGÍA", estado: 7 };
    const found = (data: ReferenciaItem[], channel: SessionChannel = SessionChannel.WHATSAPP) =>
      queryResult(QueryKind.LIST_REFERENCES, { statusReference: ReferenceStatus.FOUND, message: "", data }, channel);
    const lookupOn = (channel: SessionChannel): Session => ({ ...lookupPending(), channel });
    const rowIds = (result: HandlerResult) =>
      sent(result).flatMap((effect) => (effect.kind === "send_interactive_list" ? effect.rows.map((row) => row.id) : []));

    const list = (result: HandlerResult) => sent(result).find((effect) => effect.kind === "send_interactive_list");
    const actionIds = (result: HandlerResult) => {
      const found = list(result);
      return found?.kind === "send_interactive_list" ? (found.actions ?? []).map((action) => action.id) : [];
    };
    const CONSULTA_ACTIONS = [ReferenciaActionButtonId.NEW_APPOINTMENT, ReferenciaActionButtonId.EXIT];

    it.each([SessionChannel.WHATSAPP, SessionChannel.WEB])(
      "%s lists only the bookable ones and says nothing about the others",
      (channel) => {
        const result = handle(lookupOn(channel), found([citada, REFERENCIA], channel));

        expect(texts(result)).toEqual([]);
        expect(sent(result)[0]?.kind).toBe("send_interactive_list");
        expect(rowIds(result)).toEqual([REFERENCIA.idReferencia]);
        expect(result.session.state).toBe(SessionState.CITA_AWAITING_REFERENCIA_SELECT);
      },
    );

    it("the list explains which states can be booked and closes with Cita sin referencia and Salir", () => {
      const result = handle(lookupOn(SessionChannel.WHATSAPP), found([citada, REFERENCIA]));

      expect(list(result)).toMatchObject({
        text: "Estas son tus referencias. Para agendar una cita con una referencia, elígela de la lista: solo se pueden agendar las que están en estado ACEPTADO o PACIENTE RECIBIDO. Si prefieres una cita sin referencia, elige «Cita sin referencia».",
      });
      expect(CONSULTA_REFERENCIAS_ACTIONS).toEqual([
        { id: ReferenciaActionButtonId.NEW_APPOINTMENT, title: "Cita sin referencia" },
        { id: ReferenciaActionButtonId.EXIT, title: "Salir" },
      ]);
      expect(actionIds(result)).toEqual(CONSULTA_ACTIONS);
    });

    it("WhatsApp shows 6 references per page so both options fit next to the page controls on every page", () => {
      const many = Array.from({ length: 13 }, (_, index) => ({ ...REFERENCIA, idReferencia: `ref-${index}`, numero: `n-${index}` }));
      const first = handle(lookupOn(SessionChannel.WHATSAPP), found(many));
      const second = handle(first.session, tap(ListPageButtonId.NEXT));

      expect(rowIds(first)).toEqual(many.slice(0, 6).map((item) => item.idReferencia));
      expect(actionIds(first)).toEqual([ListPageButtonId.NEXT, ...CONSULTA_ACTIONS]);
      expect(rowIds(second)).toEqual(many.slice(6, 12).map((item) => item.idReferencia));
      expect(actionIds(second)).toEqual([ListPageButtonId.PREV, ListPageButtonId.NEXT, ...CONSULTA_ACTIONS]);
      expect(rowIds(second).length + actionIds(second).length).toBeLessThanOrEqual(10);
      expect(handle(second.session, text("1")).session.slots[SlotKey.CITA_REFERENCIA_SELECCIONADA_ID]).toBe("ref-6");
    });

    it.each([tap(ReferenciaActionButtonId.NEW_APPOINTMENT), text("cita sin referencia")])(
      "%j continues with a new appointment on the verified session, with no new code",
      (event) => {
        const listed = handle(lookupOn(SessionChannel.WHATSAPP), found([citada, REFERENCIA]));
        const result = handle(listed.session, event);

        expect(result.session.state).toBe(SessionState.CITA_AWAITING_DISTRITO_AI);
        expect(texts(result)).toEqual([VERIFIED_ASK_DISTRITO_TEXT]);
        expect(result.session.slots[SlotKey.CITA_BEARER]).toBe("token-real");
        expect(result.session.slots[SlotKey.CITA_REFERENCIAS_DATA]).toBeUndefined();
        expect(queries(result)).toEqual([]);
      },
    );

    it.each([tap(ReferenciaActionButtonId.EXIT), text("salir"), text("Salir")])("%j closes at once with the usual farewell", (event) => {
      const listed = handle(lookupOn(SessionChannel.WHATSAPP), found([citada, REFERENCIA]));
      const result = handle(listed.session, event);

      expect(result.session.state).toBe(SessionState.REFERENCIA_CLOSED);
      expect(texts(result)).toEqual([REFERENCIA_GOODBYE_TEXT]);
    });

    it.each([SessionChannel.WHATSAPP, SessionChannel.WEB])(
      "%s with none bookable says so without naming them and asks whether to book a cita, with no list",
      (channel) => {
        const result = handle(lookupOn(channel), found([citada], channel));

        expect(texts(result)).toEqual([REFERENCIA_SIN_AGENDABLES_TEXT]);
        expect(rowIds(result)).toEqual([]);
        expect(buttons(result)).toEqual({
          kind: "send_buttons",
          text: REFERENCIA_CITA_OFFER_QUESTION_TEXT,
          buttons: REFERENCIA_CITA_OFFER_BUTTONS,
        });
        expect(result.session.state).toBe(SessionState.REFERENCIA_AWAITING_CITA_OFFER);

        const yes = handle(result.session, tap(ReferenciaCitaOfferButtonId.YES));
        expect(yes.session.state).toBe(SessionState.CITA_AWAITING_DISTRITO_AI);
        expect(texts(yes)).toEqual([VERIFIED_ASK_DISTRITO_TEXT]);
        expect(yes.session.slots[SlotKey.CITA_BEARER]).toBe("token-real");
        expect(queries(yes)).toEqual([]);

        const no = handle(result.session, tap(ReferenciaCitaOfferButtonId.NO));
        expect(no.session.state).toBe(SessionState.REFERENCIA_CLOSED);
        expect(texts(no)).toEqual([REFERENCIA_GOODBYE_TEXT]);
      },
    );

    it("the web chat keeps its page of 10 cards and offers the same two options", () => {
      const many = Array.from({ length: 13 }, (_, index) => ({ ...REFERENCIA, idReferencia: `ref-${index}`, numero: `n-${index}` }));
      const result = handle(lookupOn(SessionChannel.WEB), found([citada, ...many], SessionChannel.WEB));

      expect(texts(result)).toEqual([]);
      expect(rowIds(result)).toEqual(many.slice(0, 10).map((item) => item.idReferencia));
      expect(actionIds(result)).toEqual(CONSULTA_ACTIONS);
    });
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

  it.each(["referencia_awaiting_appointment_mode", "referencia_awaiting_lookup_retry"])(
    "a session saved in the retired state %s restarts the consulta with a clean session instead of failing",
    (retired) => {
      const saved = {
        state: retired,
        slots: { ...citaOffer().slots, cita_appointment_mode: "presencial" },
        counters: {},
      } as unknown as Session;

      const result = handle(saved, text("hola"));

      expect(result.session.state).toBe(SessionState.CITA_AWAITING_DNI);
      expect(result.session.slots).toEqual({ [SlotKey.POST_LOGIN_FLOW]: PostLoginFlow.REFERENCIAS });
      expect(result.effects).toEqual([expect.objectContaining({ text: REFERENCIA_LOGIN_REQUIRED_TEXT })]);
      expect(result.notes).toContainEqual(expect.objectContaining({ kind: "retired_state", detail: { state: retired } }));
    },
  );
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

  it("a referencia without destination codes returns to the references list without silently choosing a new destination", () => {
    const session = confirmPending();
    session.slots[SlotKey.CITA_REFERENCIAS_DATA] = JSON.stringify([{ ...REFERENCIA, codigoIpressDestino: "", codigoUpsDestino: "" }]);

    const result = handle(session, text("si"));

    expect(result.session.state).toBe(SessionState.CITA_AWAITING_REFERENCIA_SELECT);
    expect(result.session.slots[SlotKey.CITA_REFERENCIA_SELECCIONADA_ID]).toBeUndefined();
    expect(queries(result)).toEqual([]);
  });

  it("asking for another one keeps the purpose", () => {
    const result = handle(confirmPending(), text("no"));

    expect(result.session.state).toBe(SessionState.CITA_AWAITING_REFERENCIA_SELECT);
    expect(result.session.slots[SlotKey.POST_LOGIN_FLOW]).toBe(PostLoginFlow.REFERENCIAS);
  });
});
