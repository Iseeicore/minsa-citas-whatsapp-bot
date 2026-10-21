import { describe, expect, it } from "vitest";
import { handle } from "@/lib/fsm/core/handlers";
import { isQueryEffect } from "@/lib/fsm/core/handlers-shared";
import { startReferenciasLookup } from "@/lib/fsm/flows/referencia/lookup";
import { AUTHENTICATED_WAITING_STATES, SESSION_IDLE_TIMEOUT_MS } from "@/lib/fsm/session/session-expiry-guard";
import type { HandleEvent, HandlerResult, InboundEvent, QueryResultEvent, Session } from "@/lib/fsm/core/types";
import type { ReferenciaItem } from "@/lib/integrations/minsa/types";
import {
  CITA_REFERENCIA_LOOKUP_ERROR_TEXT,
  CITA_REFERENCIA_MODE_BUTTONS,
  CITA_REFERENCIA_NONE_TEXT,
  CITA_REFERENCIA_RETRY_BUTTONS,
} from "@/lib/constants/textos/cita-referencia";
import { VERIFIED_ASK_DISTRITO_TEXT } from "@/lib/constants/textos/cita-identidad";
import { RESPECT_REMINDER_TEXT } from "@/lib/constants/textos/seguridad";
import { AppointmentMode } from "@/lib/enums/appointment-mode";
import { CitaReferenciaButtonId } from "@/lib/enums/cita-referencia-button-id";
import { CounterKey } from "@/lib/enums/counter-key";
import { ExitButtonId } from "@/lib/enums/exit-button-id";
import { InboundEventType } from "@/lib/enums/inbound-event-type";
import { InternalEventType } from "@/lib/enums/internal-event-type";
import { PostLoginFlow } from "@/lib/enums/post-login-flow";
import { QueryKind } from "@/lib/enums/query-kind";
import { ReferenceStatus } from "@/lib/enums/reference-status";
import { SendType } from "@/lib/enums/send-type";
import { SessionChannel } from "@/lib/enums/session-channel";
import { SessionState } from "@/lib/enums/session-state";
import { SlotKey } from "@/lib/enums/slot-key";
import { VerifyCodeStatus } from "@/lib/enums/verify-code-status";

const FROM = "sandbox-appointment-mode";
const DNI = "12345678";
const NOW = Date.parse("2026-10-21T15:00:00Z");

const REFERENCE: ReferenciaItem = {
  idReferencia: "ref-cardio",
  numero: "00001",
  fechaInicio: "20/10/2026 10:30",
  ipressOrigen: "CENTRO DE ORIGEN",
  ipressDestino: "HOSPITAL DE DESTINO",
  upsOrigen: "MEDICINA GENERAL",
  upsDestino: "CARDIOLOGÍA",
  codigoIpressDestino: "eess-destino",
  codigoUpsDestino: "ups-cardio",
  estado: 3,
};

const text = (value: string): InboundEvent => ({ from: FROM, type: InboundEventType.TEXT, text: value, channel: SessionChannel.WEB });
const tap = (id: string): InboundEvent => ({ from: FROM, type: InboundEventType.BUTTON, listId: id, channel: SessionChannel.WEB });
const queryResult = (queryKind: QueryKind, result: unknown): QueryResultEvent => ({
  from: FROM,
  type: InternalEventType.QUERY_RESULT,
  queryKind,
  result,
  channel: SessionChannel.WEB,
});
const verified = queryResult(QueryKind.VERIFY_CODE, { status: VerifyCodeStatus.VERIFIED, token: "private-token" });
const queries = (result: HandlerResult) => result.effects.filter(isQueryEffect);
const texts = (result: HandlerResult) => result.effects.flatMap((effect) => (effect.kind === SendType.TEXT ? [effect.text] : []));
const buttons = (result: HandlerResult) => result.effects.find((effect) => effect.kind === SendType.BUTTONS);
const turn = (session: Session, event: HandleEvent) => handle(session, event, NOW);

function verifyPending(slots: Session["slots"] = {}): Session {
  return {
    state: SessionState.CITA_VERIFY_PENDING,
    slots: { [SlotKey.CITA_DNI_PENDING]: DNI, [SlotKey.CITA_TWOFA_ID]: "twofa", ...slots },
    counters: {},
  };
}

function waiting(state: Session["state"] = SessionState.REFERENCIA_AWAITING_APPOINTMENT_MODE, slots: Session["slots"] = {}): Session {
  return {
    state,
    slots: {
      [SlotKey.CITA_BEARER]: "private-token",
      [SlotKey.CITA_DNI]: DNI,
      [SlotKey.POST_LOGIN_FLOW]: PostLoginFlow.CITA_REFERENCIAS,
      [SlotKey.CITA_REFERENCIAS_DATA]: JSON.stringify([REFERENCE]),
      ...slots,
    },
    counters: {},
    updatedAt: new Date(NOW),
  };
}

function lookupResult(statusReference: ReferenceStatus, data: ReferenciaItem[] = []): QueryResultEvent {
  return queryResult(QueryKind.LIST_REFERENCES, { statusReference, message: "", data });
}

describe("appointment references are consulted after identity verification on both channels", () => {
  it("verifies the document once and consults MINSA before asking for a district", () => {
    const session = verifyPending({ [SlotKey.CITA_DISTRITO_HINT_TEXT]: "Lince" });
    const before = structuredClone(session);
    const result = turn(session, verified);

    expect(result.session.state).toBe(SessionState.REFERENCIA_LOOKUP_PENDING);
    expect(result.session.channel).toBe(SessionChannel.WEB);
    expect(result.session.slots).toMatchObject({
      [SlotKey.CITA_BEARER]: "private-token",
      [SlotKey.CITA_DNI]: DNI,
      [SlotKey.CITA_DISTRITO_HINT_TEXT]: "Lince",
      [SlotKey.POST_LOGIN_FLOW]: PostLoginFlow.CITA_REFERENCIAS,
    });
    expect(result.session.slots[SlotKey.CITA_DNI_PENDING]).toBeUndefined();
    expect(result.session.slots[SlotKey.CITA_TWOFA_ID]).toBeUndefined();
    expect(queries(result)).toEqual([{ kind: QueryKind.LIST_REFERENCES, payload: { numeroDocumento: DNI, tipoDocumento: "01" } }]);
    expect(session).toEqual(before);
  });

  it.each([undefined, SessionChannel.WHATSAPP])(
    "consults references before offering WhatsApp appointment modes for channel %s",
    (channel) => {
      const result = turn(verifyPending(), { ...verified, channel });
      expect(result.session.state).toBe(SessionState.REFERENCIA_LOOKUP_PENDING);
      expect(queries(result)).toEqual([{ kind: QueryKind.LIST_REFERENCES, payload: { numeroDocumento: DNI, tipoDocumento: "01" } }]);
      expect(result.session.slots[SlotKey.POST_LOGIN_FLOW]).toBe(PostLoginFlow.CITA_REFERENCIAS);
    },
  );

  it("uses the session channel when an internal event does not repeat it", () => {
    const result = turn({ ...verifyPending(), channel: SessionChannel.WEB }, { ...verified, channel: undefined });
    expect(result.session.state).toBe(SessionState.REFERENCIA_LOOKUP_PENDING);
  });

  it("does not consult references when the OTP is incorrect", () => {
    const result = turn(verifyPending(), queryResult(QueryKind.VERIFY_CODE, { status: VerifyCodeStatus.INVALID }));
    expect(result.session.state).toBe(SessionState.CITA_AWAITING_OTP);
    expect(queries(result)).toEqual([]);
    expect(result.session.slots[SlotKey.POST_LOGIN_FLOW]).toBeUndefined();
  });
});

describe("MINSA references determine whether an appointment mode is offered", () => {
  it("offers both modes and retains all MINSA statuses without filtering", () => {
    const references = [3, 5, 7].map((estado) => ({ ...REFERENCE, estado, idReferencia: `reference-${estado}` }));
    const result = turn(waiting(SessionState.REFERENCIA_LOOKUP_PENDING), lookupResult(ReferenceStatus.FOUND, references));
    expect(result.session.state).toBe(SessionState.REFERENCIA_AWAITING_APPOINTMENT_MODE);
    expect(buttons(result)).toMatchObject({ buttons: CITA_REFERENCIA_MODE_BUTTONS });
    expect(JSON.parse(String(result.session.slots[SlotKey.CITA_REFERENCIAS_DATA]))).toEqual(references);
    expect(queries(result)).toEqual([]);
  });

  it("continues a new appointment directly when MINSA confirms no references", () => {
    const result = turn(waiting(SessionState.REFERENCIA_LOOKUP_PENDING), lookupResult(ReferenceStatus.EMPTY));
    expect(result.session.state).toBe(SessionState.CITA_AWAITING_DISTRITO_AI);
    expect(texts(result)).toEqual([CITA_REFERENCIA_NONE_TEXT, VERIFIED_ASK_DISTRITO_TEXT]);
    expect(result.session.slots[SlotKey.CITA_BEARER]).toBe("private-token");
    expect(result.session.slots[SlotKey.CITA_DNI]).toBe(DNI);
    expect(result.session.slots[SlotKey.CITA_APPOINTMENT_MODE]).toBe(AppointmentMode.NEW);
    expect(result.session.slots[SlotKey.CITA_REFERENCIAS_DATA]).toBeUndefined();
    expect(queries(result)).toEqual([]);
  });

  it.each([ReferenceStatus.ERROR, ReferenceStatus.FOUND])("separates failed or unusable %s responses from no references", (status) => {
    const result = turn(waiting(SessionState.REFERENCIA_LOOKUP_PENDING), lookupResult(status));
    expect(result.session.state).toBe(SessionState.REFERENCIA_AWAITING_LOOKUP_RETRY);
    expect(texts(result)).toEqual([CITA_REFERENCIA_LOOKUP_ERROR_TEXT]);
    expect(buttons(result)).toMatchObject({ buttons: CITA_REFERENCIA_RETRY_BUTTONS });
    expect(result.session.slots[SlotKey.CITA_BEARER]).toBe("private-token");
    expect(texts(result)).not.toContain(CITA_REFERENCIA_NONE_TEXT);
  });

  it("keeps Consultar referencia's existing direct selection", () => {
    const session = waiting(SessionState.REFERENCIA_LOOKUP_PENDING, { [SlotKey.POST_LOGIN_FLOW]: PostLoginFlow.REFERENCIAS });
    const result = turn(session, lookupResult(ReferenceStatus.FOUND, [REFERENCE]));
    expect(result.session.state).toBe(SessionState.CITA_AWAITING_REFERENCIA_SELECT);
    expect(result.session.slots[SlotKey.CITA_APPOINTMENT_MODE]).toBeUndefined();
  });
});

describe("choosing an appointment mode", () => {
  it.each([tap(CitaReferenciaButtonId.REFERENCE), text("2"), text("cita con referencia")])("reuses reference selection for %j", (event) => {
    const result = turn(waiting(), event);
    expect(result.session.state).toBe(SessionState.CITA_AWAITING_REFERENCIA_SELECT);
    expect(result.session.channel).toBe(SessionChannel.WEB);
    expect(result.session.slots[SlotKey.CITA_APPOINTMENT_MODE]).toBe(AppointmentMode.REFERENCE);
    const list = result.effects.find((effect) => effect.kind === SendType.INTERACTIVE_LIST);
    expect(list).toMatchObject({ rows: [expect.objectContaining({ id: REFERENCE.idReferencia, title: REFERENCE.upsDestino })] });
    expect(queries(result)).toEqual([]);
  });

  it.each([tap(CitaReferenciaButtonId.NEW), text("1"), text("nueva cita")])("continues without another OTP for %j", (event) => {
    const result = turn(waiting(), event);
    expect(result.session.state).toBe(SessionState.CITA_AWAITING_DISTRITO_AI);
    expect(result.session.slots[SlotKey.CITA_BEARER]).toBe("private-token");
    expect(result.session.slots[SlotKey.CITA_DNI]).toBe(DNI);
    expect(result.session.slots[SlotKey.POST_LOGIN_FLOW]).toBeUndefined();
    expect(result.session.slots[SlotKey.CITA_REFERENCIA_SELECCIONADA_ID]).toBeUndefined();
    expect(queries(result)).toEqual([]);
  });

  it("removes the previous reference's destination, availability and booking when starting a new appointment", () => {
    const session = waiting(SessionState.REFERENCIA_AWAITING_APPOINTMENT_MODE, {
      [SlotKey.CITA_COD_EESS]: "old-hospital",
      [SlotKey.CITA_ESPECIALIDAD_ID]: "old-ups",
      [SlotKey.CITA_ESPECIALIDAD_NOMBRE]: "old-specialty",
      [SlotKey.CITA_ESTABLECIMIENTO_NOMBRE]: "old-establishment",
      [SlotKey.CITA_REFERENCIA_SELECCIONADA_ID]: REFERENCE.idReferencia,
      [SlotKey.CITA_FECHA]: "2026-10-22",
      [SlotKey.CITA_HORA_CONFIRM_ID]: "10:00",
      [SlotKey.CITA_HORAS_DIA]: "[]",
      [SlotKey.CITA_ESPECIALIDAD_HINT_TEXT]: "medicina general",
    });
    session.counters[CounterKey.CITA_HORA_PAGE] = 2;
    const before = structuredClone(session);
    const result = turn(session, tap(CitaReferenciaButtonId.NEW));
    expect(result.session.slots).toEqual({
      [SlotKey.CITA_BEARER]: "private-token",
      [SlotKey.CITA_DNI]: DNI,
      [SlotKey.CITA_APPOINTMENT_MODE]: AppointmentMode.NEW,
      [SlotKey.CITA_ESPECIALIDAD_HINT_TEXT]: "medicina general",
    });
    expect(result.session.counters).toEqual({});
    expect(session).toEqual(before);
  });

  it.each([text("quizás"), tap(CitaReferenciaButtonId.RETRY), tap("old-unrelated-button")])("rejects unrelated answers for %j", (event) => {
    const result = turn(waiting(), event);
    expect(result.session.state).toBe(SessionState.REFERENCIA_AWAITING_APPOINTMENT_MODE);
    expect(buttons(result)).toMatchObject({ buttons: CITA_REFERENCIA_MODE_BUTTONS });
    expect(queries(result)).toEqual([]);
  });
});

describe("manual retries after a failed reference lookup", () => {
  it.each([tap(CitaReferenciaButtonId.RETRY), text("1"), text("reintentar consulta")])("consults references again for %j", (event) => {
    const result = turn(waiting(SessionState.REFERENCIA_AWAITING_LOOKUP_RETRY), event);
    expect(result.session.state).toBe(SessionState.REFERENCIA_LOOKUP_PENDING);
    expect(result.session.slots[SlotKey.CITA_BEARER]).toBe("private-token");
    expect(result.session.slots[SlotKey.CITA_REFERENCIAS_DATA]).toBeUndefined();
    expect(queries(result)).toEqual([{ kind: QueryKind.LIST_REFERENCES, payload: { numeroDocumento: DNI, tipoDocumento: "01" } }]);
  });

  it.each([tap(CitaReferenciaButtonId.NEW), text("2"), text("nueva cita")])("allows a voluntary new appointment for %j", (event) => {
    const result = turn(waiting(SessionState.REFERENCIA_AWAITING_LOOKUP_RETRY), event);
    expect(result.session.state).toBe(SessionState.CITA_AWAITING_DISTRITO_AI);
    expect(result.session.slots[SlotKey.CITA_APPOINTMENT_MODE]).toBe(AppointmentMode.NEW);
    expect(queries(result)).toEqual([]);
  });

  it("clears stale selections only for the new web appointment purpose", () => {
    const original = waiting(SessionState.REFERENCIA_AWAITING_LOOKUP_RETRY, { [SlotKey.CITA_REFERENCIA_SELECCIONADA_ID]: "stale" });
    const before = structuredClone(original);
    const result = startReferenciasLookup(original);
    expect(result.session.slots[SlotKey.CITA_REFERENCIA_SELECCIONADA_ID]).toBeUndefined();
    expect(result.session.slots[SlotKey.CITA_REFERENCIAS_DATA]).toBeUndefined();
    expect(original).toEqual(before);
  });
});

describe("the new appointment states retain authentication and exit protections", () => {
  const newStates = [SessionState.REFERENCIA_AWAITING_APPOINTMENT_MODE, SessionState.REFERENCIA_AWAITING_LOOKUP_RETRY];

  it.each(newStates)("protects %s on idle expiration and reconsults after OTP", (state) => {
    expect(AUTHENTICATED_WAITING_STATES).toContain(state);
    const session = { ...waiting(state), updatedAt: new Date(NOW - SESSION_IDLE_TIMEOUT_MS - 1) };
    const expired = turn(session, text("1"));
    expect(expired.session.state).toBe(SessionState.CITA_AWAITING_REAUTH);
    expect(expired.session.slots[SlotKey.POST_LOGIN_FLOW]).toBe(PostLoginFlow.CITA_REFERENCIAS);
    const result = turn({ ...expired.session, state: SessionState.CITA_VERIFY_PENDING }, verified);
    expect(result.session.state).toBe(SessionState.REFERENCIA_LOOKUP_PENDING);
    expect(queries(result).map((effect) => effect.kind)).toEqual([QueryKind.LIST_REFERENCES]);
  });

  it("preserves the reference choice when references are refreshed after reauthentication", () => {
    const session = waiting(SessionState.REFERENCIA_LOOKUP_PENDING, { [SlotKey.CITA_APPOINTMENT_MODE]: AppointmentMode.REFERENCE });
    const result = turn(session, lookupResult(ReferenceStatus.FOUND, [REFERENCE]));
    expect(result.session.state).toBe(SessionState.CITA_AWAITING_REFERENCIA_SELECT);
    expect(result.session.slots[SlotKey.CITA_APPOINTMENT_MODE]).toBe(AppointmentMode.REFERENCE);
  });

  it.each([
    [SessionState.CITA_FECHA_PENDING, QueryKind.LIST_FECHAS],
    [SessionState.CITA_HORA_PENDING, QueryKind.LIST_HORAS],
  ])("resumes %s instead of repeating reference lookup after OTP", (state, queryKind) => {
    const session = verifyPending({
      [SlotKey.CITA_RESUME_STATE]: state,
      [SlotKey.CITA_APPOINTMENT_MODE]: AppointmentMode.REFERENCE,
      [SlotKey.CITA_COD_EESS]: REFERENCE.codigoIpressDestino,
      [SlotKey.CITA_ESPECIALIDAD_ID]: REFERENCE.codigoUpsDestino,
      [SlotKey.CITA_FECHA]: "2026-10-22",
    });
    const result = turn(session, verified);
    expect(result.session.state).toBe(state);
    expect(queries(result).map((effect) => effect.kind)).toEqual([queryKind]);
    expect(result.session.slots[SlotKey.CITA_RESUME_STATE]).toBeUndefined();
  });

  it("does not offer modes again after choosing a new appointment and reauthenticating", () => {
    const result = turn(verifyPending({ [SlotKey.CITA_APPOINTMENT_MODE]: AppointmentMode.NEW }), verified);
    expect(result.session.state).toBe(SessionState.CITA_AWAITING_DISTRITO_AI);
    expect(queries(result)).toEqual([]);
  });

  it.each(newStates)("returns to %s after declining to exit", (state) => {
    const result = turn(waiting(state), text("quiero salir"));
    expect(result.session.state).toBe(SessionState.CITA_AWAITING_EXIT_CONFIRM);
    const continued = turn(result.session, tap(ExitButtonId.NO));
    expect(continued.session.state).toBe(state);
    expect(buttons(continued)).toMatchObject({
      buttons: state === SessionState.REFERENCIA_AWAITING_APPOINTMENT_MODE ? CITA_REFERENCIA_MODE_BUTTONS : CITA_REFERENCIA_RETRY_BUTTONS,
    });
  });

  it.each(newStates)("retains %s after an abusive message and repeats its choices", (state) => {
    const result = turn(waiting(state), text("eres un imbécil"));
    expect(result.session.state).toBe(state);
    expect(texts(result)).toContain(RESPECT_REMINDER_TEXT);
    expect(buttons(result)).toBeDefined();
    expect(queries(result)).toEqual([]);
  });
});
