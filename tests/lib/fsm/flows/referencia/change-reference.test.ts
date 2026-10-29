import { describe, expect, it } from "vitest";
import { handle } from "@/lib/fsm/core/handlers";
import { buildResult, isQueryEffect, sendButtons, sendText } from "@/lib/fsm/core/handlers-shared";
import {
  handleChangeReference,
  isChangeReferenceRequest,
  referenceChangeReauthSession,
  withReferenceChangeAction,
} from "@/lib/fsm/flows/referencia/change-reference";
import { SESSION_IDLE_TIMEOUT_MS } from "@/lib/fsm/session/session-expiry-guard";
import type { HandleEvent, HandlerResult, InboundEvent, SendInteractiveListEffect, Session } from "@/lib/fsm/core/types";
import type { ReferenciaItem } from "@/lib/integrations/minsa/types";
import { CITA_REFERENCIA_CHANGE_BUTTON, CITA_REFERENCIA_CHANGE_PROMPT_TEXT } from "@/lib/constants/textos/cita-referencia";
import { HORA_CONFIRM_BUTTONS } from "@/lib/constants/textos/cita-fecha-hora";
import { CounterKey } from "@/lib/enums/counter-key";
import { HoraPageButtonId } from "@/lib/enums/hora-page-button-id";
import { InboundEventType } from "@/lib/enums/inbound-event-type";
import { InternalEventType } from "@/lib/enums/internal-event-type";
import { ListPageButtonId } from "@/lib/enums/list-page-button-id";
import { PostLoginFlow } from "@/lib/enums/post-login-flow";
import { QueryKind } from "@/lib/enums/query-kind";
import { ReauthButtonId } from "@/lib/enums/reauth-button-id";
import { ReferenceStatus } from "@/lib/enums/reference-status";
import { ReferenciaActionButtonId } from "@/lib/enums/referencia-action-button-id";
import { SendType } from "@/lib/enums/send-type";
import { SessionChannel } from "@/lib/enums/session-channel";
import { SessionState } from "@/lib/enums/session-state";
import { SlotKey } from "@/lib/enums/slot-key";
import { ValidateUserStatus } from "@/lib/enums/validate-user-status";
import { VerifyCodeStatus } from "@/lib/enums/verify-code-status";

const FROM = "sandbox-change-reference";
const NOW = Date.parse("2026-10-21T15:00:00Z");
const REFERENCE: ReferenciaItem = {
  idReferencia: "synthetic-reference-a",
  numero: "SYN-001",
  fechaInicio: "01/10/2099 10:00",
  ipressOrigen: "CENTRO SIMULADO",
  ipressDestino: "HOSPITAL SIMULADO",
  upsOrigen: "MEDICINA GENERAL",
  upsDestino: "CARDIOLOGÍA",
  codigoIpressDestino: "eess-synthetic",
  codigoUpsDestino: "ups-synthetic",
  estado: 5,
};

const WAITING_STATES = [
  SessionState.CITA_AWAITING_FECHA_SELECT,
  SessionState.CITA_AWAITING_HORA_SELECT,
  SessionState.CITA_AWAITING_HORA_CONFIRM,
  SessionState.CITA_AWAITING_HORA_CHOICE,
  SessionState.CITA_AWAITING_OTHER_FECHA,
  SessionState.CITA_AWAITING_REFERENCIA_CONFIRM,
];

const tap = (listId: string): InboundEvent => ({ from: FROM, type: InboundEventType.BUTTON, listId, channel: SessionChannel.WEB });
const text = (value: string): InboundEvent => ({ from: FROM, type: InboundEventType.TEXT, text: value, channel: SessionChannel.WEB });
const turn = (session: Session, event: HandleEvent): HandlerResult => handle(session, event, NOW);
const queries = (result: HandlerResult) => result.effects.filter(isQueryEffect);

function waiting(state: Session["state"] = SessionState.CITA_AWAITING_FECHA_SELECT): Session {
  return {
    state,
    channel: SessionChannel.WEB,
    updatedAt: new Date(NOW),
    slots: {
      [SlotKey.CITA_DNI]: "23456789",
      [SlotKey.CITA_BEARER]: "synthetic-token",
      [SlotKey.CITA_REFERENCIAS_DATA]: JSON.stringify([REFERENCE]),
      [SlotKey.CITA_REFERENCIA_SELECCIONADA_ID]: REFERENCE.idReferencia,
      [SlotKey.CITA_COD_EESS]: REFERENCE.codigoIpressDestino,
      [SlotKey.CITA_ESPECIALIDAD_ID]: REFERENCE.codigoUpsDestino,
      [SlotKey.CITA_ESTABLECIMIENTO_NOMBRE]: REFERENCE.ipressDestino,
      [SlotKey.CITA_ESPECIALIDAD_NOMBRE]: REFERENCE.upsDestino,
      [SlotKey.CITA_FECHA]: "01/01/2099",
      [SlotKey.CITA_HORA_CONFIRM_ID]: "09:00|09:30",
    },
    counters: { [CounterKey.CITA_HORA_PAGE]: 1, [CounterKey.CITA_BOOKING_FAILURES]: 2 },
  };
}

function listEffect(): SendInteractiveListEffect {
  return { kind: SendType.INTERACTIVE_LIST, text: "Opciones de prueba", rows: [{ id: "01/01/2099", title: "Fecha de prueba" }] };
}

describe("las acciones de referencia comparten el mensaje interactivo de la lista", () => {
  it("integra la paginación y el cambio en la lista sin dejar otro mensaje que la desactive", () => {
    const result = buildResult(waiting(), [
      sendText("Texto de prueba"),
      listEffect(),
      sendButtons("Paginación de prueba", [
        { id: ListPageButtonId.PREV, title: "Anterior" },
        { id: ListPageButtonId.NEXT, title: "Siguiente" },
      ]),
    ]);
    const before = structuredClone(result);
    const actual = withReferenceChangeAction(result);
    expect(actual.effects).toEqual([
      sendText("Texto de prueba"),
      {
        ...listEffect(),
        actions: [
          { id: ListPageButtonId.PREV, title: "Anterior" },
          { id: ListPageButtonId.NEXT, title: "Siguiente" },
          CITA_REFERENCIA_CHANGE_BUTTON,
        ],
      },
    ]);
    expect(result).toEqual(before);
  });

  it("conserva las acciones existentes y la paginación de horarios al decorar otra vez", () => {
    const next = { id: HoraPageButtonId.NEXT, title: "Más horarios" };
    const result = buildResult(waiting(SessionState.CITA_AWAITING_HORA_SELECT), [
      { ...listEffect(), actions: [next, CITA_REFERENCIA_CHANGE_BUTTON] },
      sendButtons("Paginación", [next]),
    ]);
    const actual = withReferenceChangeAction(result);
    expect(actual.effects).toEqual([{ ...listEffect(), actions: [next, CITA_REFERENCIA_CHANGE_BUTTON] }]);
    expect(withReferenceChangeAction(actual)).toEqual(actual);
  });

  it("mantiene la confirmación final y agrega cambiar referencia como tercer botón", () => {
    const result = buildResult(waiting(SessionState.CITA_AWAITING_HORA_CONFIRM), [
      sendText("Resumen de prueba"),
      sendButtons("Confirmación de prueba", HORA_CONFIRM_BUTTONS),
    ]);
    const actual = withReferenceChangeAction(result);
    expect(actual.effects).toEqual([
      sendText("Resumen de prueba"),
      sendButtons("Confirmación de prueba", [...HORA_CONFIRM_BUTTONS, CITA_REFERENCIA_CHANGE_BUTTON]),
    ]);
    expect(withReferenceChangeAction(actual)).toEqual(actual);
  });

  it.each(WAITING_STATES)("permite recuperar %s si la respuesta sólo contiene texto", (state) => {
    const actual = withReferenceChangeAction(buildResult(waiting(state), [sendText("Aviso de prueba")]));
    expect(actual.effects).toEqual([
      sendText("Aviso de prueba"),
      sendButtons(CITA_REFERENCIA_CHANGE_PROMPT_TEXT, [CITA_REFERENCIA_CHANGE_BUTTON]),
    ]);
  });

  it.each([SessionState.CITA_FECHA_PENDING, SessionState.CITA_HORA_PENDING, SessionState.CITA_BOOKING_PENDING])(
    "no agrega acciones mientras hay una consulta pendiente en %s",
    (state) => {
      const result = buildResult(waiting(state), []);
      expect(withReferenceChangeAction(result)).toBe(result);
    },
  );

  it("no modifica una cita nueva en ninguno de los canales", () => {
    const newAppointment = waiting();
    delete newAppointment.slots[SlotKey.CITA_REFERENCIA_SELECCIONADA_ID];
    for (const channel of [SessionChannel.WHATSAPP, SessionChannel.WEB]) {
      const session = { ...newAppointment, channel };
      const result = buildResult(session, [listEffect()]);
      expect(withReferenceChangeAction(result)).toBe(result);
      expect(handleChangeReference(session, tap(ReferenciaActionButtonId.CHANGE))).toBeUndefined();
    }
  });
});

describe("cambiar referencia reutiliza el reinicio canónico sin perder la identidad", () => {
  it.each(WAITING_STATES.flatMap((state) => [SessionChannel.WHATSAPP, SessionChannel.WEB].map((channel) => [state, channel] as const)))(
    "vuelve a la lista desde %s en %s y retira la reserva anterior",
    (state, channel) => {
      const session = waiting(state);
      session.channel = channel;
      const before = structuredClone(session);
      const actual = handleChangeReference(session, tap(ReferenciaActionButtonId.CHANGE));
      expect(actual?.session.state).toBe(SessionState.CITA_AWAITING_REFERENCIA_SELECT);
      expect(actual?.session.slots).toMatchObject({
        [SlotKey.CITA_DNI]: "23456789",
        [SlotKey.CITA_BEARER]: "synthetic-token",
        [SlotKey.POST_LOGIN_FLOW]: PostLoginFlow.REFERENCIAS,
        [SlotKey.CITA_REFERENCIAS_DATA]: JSON.stringify([REFERENCE]),
      });
      for (const slot of [
        SlotKey.CITA_REFERENCIA_SELECCIONADA_ID,
        SlotKey.CITA_COD_EESS,
        SlotKey.CITA_ESPECIALIDAD_ID,
        SlotKey.CITA_FECHA,
      ]) {
        expect(actual?.session.slots[slot]).toBeUndefined();
      }
      expect(actual?.session.counters).toEqual({});
      expect(actual && queries(actual)).toEqual([]);
      expect(session).toEqual(before);
    },
  );

  it.each(["Cambiar referencia", "  cambiar REFERENCIA  "])("acepta únicamente la intención canónica %s", (answer) => {
    expect(isChangeReferenceRequest(waiting(), text(answer))).toBe(true);
    expect(handleChangeReference(waiting(), text(answer))?.session.state).toBe(SessionState.CITA_AWAITING_REFERENCIA_SELECT);
  });

  it.each(["No quiero cambiar referencia", "Cambiar fecha", "Referencia", "Otra especialidad"])(
    "no interpreta %s como cambio",
    (answer) => {
      expect(isChangeReferenceRequest(waiting(), text(answer))).toBe(false);
    },
  );

  it("no interpreta resultados de proveedor ni botones ajenos como cambio", () => {
    expect(isChangeReferenceRequest(waiting(), tap(HoraPageButtonId.NEXT))).toBe(false);
    expect(
      isChangeReferenceRequest(waiting(), {
        from: FROM,
        type: InternalEventType.QUERY_RESULT,
        queryKind: QueryKind.LIST_FECHAS,
        result: {},
      }),
    ).toBe(false);
  });

  it("recupera el canal web aunque la sesión de PostgreSQL no lo incluya", () => {
    const session = waiting();
    delete session.channel;
    const actual = turn(session, tap(ReferenciaActionButtonId.CHANGE));
    expect(actual.session.state).toBe(SessionState.CITA_AWAITING_REFERENCIA_SELECT);
    expect(actual.session.channel).toBe(SessionChannel.WEB);
    expect(queries(actual)).toEqual([]);
  });
});

describe("cambiar referencia respeta la prioridad de autenticación y emergencia", () => {
  it("conserva la intención al vencer la sesión y consulta referencias sólo después de otro OTP", () => {
    const session = { ...waiting(), updatedAt: new Date(NOW - SESSION_IDLE_TIMEOUT_MS - 1) };
    const before = structuredClone(session);
    const reauth = turn(session, tap(ReferenciaActionButtonId.CHANGE));
    expect(reauth.session.state).toBe(SessionState.CITA_AWAITING_REAUTH);
    expect(reauth.session.slots[SlotKey.CITA_RESUME_STATE]).toBeUndefined();
    expect(reauth.session.slots[SlotKey.POST_LOGIN_FLOW]).toBe(PostLoginFlow.REFERENCIAS);
    expect(reauth.session.slots[SlotKey.CITA_REFERENCIA_SELECCIONADA_ID]).toBeUndefined();
    expect(queries(reauth)).toEqual([]);
    expect(session).toEqual(before);

    const accepted = turn(reauth.session, tap(ReauthButtonId.YES));
    const validated = turn(accepted.session, {
      from: FROM,
      channel: SessionChannel.WEB,
      type: InternalEventType.QUERY_RESULT,
      queryKind: QueryKind.VALIDATE_USER,
      result: { status: ValidateUserStatus.VALID, twofaId: "synthetic-twofa" },
    });
    const code = turn(validated.session, text("123456"));
    const verified = turn(code.session, {
      from: FROM,
      channel: SessionChannel.WEB,
      type: InternalEventType.QUERY_RESULT,
      queryKind: QueryKind.VERIFY_CODE,
      result: { status: VerifyCodeStatus.VERIFIED, token: "synthetic-renewed-token" },
    });
    expect(verified.session.state).toBe(SessionState.REFERENCIA_LOOKUP_PENDING);
    expect(queries(verified).map((effect) => effect.kind)).toEqual([QueryKind.LIST_REFERENCES]);
    const refreshed = turn(verified.session, {
      from: FROM,
      channel: SessionChannel.WEB,
      type: InternalEventType.QUERY_RESULT,
      queryKind: QueryKind.LIST_REFERENCES,
      result: { statusReference: ReferenceStatus.FOUND, message: "", data: [REFERENCE] },
    });
    expect(refreshed.session.state).toBe(SessionState.CITA_AWAITING_REFERENCIA_SELECT);
    expect(queries(refreshed)).toEqual([]);
  });

  it("no cambia el propósito de otros eventos al preparar la reautenticación", () => {
    const session = waiting();
    expect(referenceChangeReauthSession(session, text("01/01/2099"))).toBe(session);
  });

  it("una emergencia conserva prioridad sobre la sesión vencida y no ofrece acciones de reserva", () => {
    const session = { ...waiting(), updatedAt: new Date(NOW - SESSION_IDLE_TIMEOUT_MS - 1) };
    const actual = turn(session, text("no puedo respirar"));
    expect(actual.session.state).toBe(SessionState.EMERGENCY_CLOSED);
    expect(actual.effects.every((effect) => effect.kind === SendType.TEXT)).toBe(true);
    expect(queries(actual)).toEqual([]);
  });
});
