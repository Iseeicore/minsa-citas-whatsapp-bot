import { describe, expect, it } from "vitest";
import { handle } from "@/lib/fsm/core/handlers";
import { isQueryEffect } from "@/lib/fsm/core/handlers-shared";
import { askOtherReference, handleOtherReference, handleOtherReferenceClose } from "@/lib/fsm/flows/referencia/other-reference";
import { AUTHENTICATED_WAITING_STATES, SESSION_IDLE_TIMEOUT_MS } from "@/lib/fsm/session/session-expiry-guard";
import type { HandleEvent, HandlerResult, InboundEvent, Session } from "@/lib/fsm/core/types";
import type { ReferenciaItem } from "@/lib/integrations/minsa/types";
import {
  CITA_REFERENCIA_OTHER_BUTTONS,
  CITA_REFERENCIA_SIN_FECHAS_BUTTONS,
  CITA_REFERENCIA_SIN_FECHAS_TEXT,
  CITA_REFERENCIA_SIN_SELECCIONABLES_TEXT,
} from "@/lib/constants/textos/cita-referencia";
import {
  REFERENCIA_SIN_FECHAS_TEXT,
  REFERENCIA_SIN_PROGRAMACION_ETIQUETA,
  REFERENCIA_SIN_PROGRAMACION_TEXT,
} from "@/lib/constants/textos/cita-reserva";
import { OtherReferenciaCitaButtonId } from "@/lib/enums/other-referencia-cita-button-id";
import { readOffered } from "@/lib/fsm/parsing/selection/selection-matchers";
import { REFERENCIA_GOODBYE_TEXT } from "@/lib/constants/textos/referencia";
import { RESPECT_REMINDER_TEXT } from "@/lib/constants/textos/seguridad";
import { AppointmentMode } from "@/lib/enums/appointment-mode";
import { CatalogStatus } from "@/lib/enums/catalog-status";
import { CounterKey } from "@/lib/enums/counter-key";
import { ExitButtonId } from "@/lib/enums/exit-button-id";
import { InboundEventType } from "@/lib/enums/inbound-event-type";
import { InternalEventType } from "@/lib/enums/internal-event-type";
import { OtherReferenciaButtonId } from "@/lib/enums/other-referencia-button-id";
import { PostLoginFlow } from "@/lib/enums/post-login-flow";
import { QueryKind } from "@/lib/enums/query-kind";
import { ReauthButtonId } from "@/lib/enums/reauth-button-id";
import { ReferenceStatus } from "@/lib/enums/reference-status";
import { SendType } from "@/lib/enums/send-type";
import { SessionChannel } from "@/lib/enums/session-channel";
import { SessionState } from "@/lib/enums/session-state";
import { SlotKey } from "@/lib/enums/slot-key";
import { VerifyCodeStatus } from "@/lib/enums/verify-code-status";

const FROM = "synthetic-other-reference";
const NOW = Date.parse("2026-10-21T21:00:00Z");
const REFERENCES: ReferenciaItem[] = [3, 5].map((estado, index) => ({
  idReferencia: `synthetic-reference-${index}`,
  numero: `00${index}`,
  fechaInicio: "01/10/2026 10:00",
  ipressOrigen: "CENTRO SINTÉTICO",
  ipressDestino: `HOSPITAL ${index}`,
  upsOrigen: "CONSULTA EXTERNA",
  upsDestino: `ESPECIALIDAD ${index}`,
  codigoIpressDestino: `eess-${index}`,
  codigoUpsDestino: `ups-${index}`,
  estado,
}));
const text = (value: string): InboundEvent => ({ from: FROM, type: InboundEventType.TEXT, text: value });
const tap = (listId: string): InboundEvent => ({ from: FROM, type: InboundEventType.BUTTON, listId });
const query = (queryKind: QueryKind, result: unknown): HandleEvent => ({
  from: FROM,
  type: InternalEventType.QUERY_RESULT,
  queryKind,
  result,
});
const turn = (session: Session, event: HandleEvent) => handle(session, event, NOW);
const queries = (result: HandlerResult) => result.effects.filter(isQueryEffect);

function pending(channel: SessionChannel, mode?: AppointmentMode): Session {
  return {
    channel,
    state: SessionState.CITA_FECHA_PENDING,
    updatedAt: new Date(NOW),
    slots: {
      [SlotKey.CITA_BEARER]: "synthetic-token",
      [SlotKey.CITA_DNI]: "12345678",
      ...(mode ? { [SlotKey.CITA_APPOINTMENT_MODE]: mode } : {}),
      [SlotKey.CITA_REFERENCIAS_DATA]: JSON.stringify(REFERENCES),
      [SlotKey.CITA_REFERENCIA_SELECCIONADA_ID]: REFERENCES[0].idReferencia,
      [SlotKey.CITA_COD_EESS]: "eess-0",
      [SlotKey.CITA_ESPECIALIDAD_ID]: "ups-0",
      [SlotKey.CITA_FECHA]: "01/01/2099",
      [SlotKey.CITA_HORA_CONFIRM_ID]: "09:00|09:30",
      [SlotKey.CITA_HORAS_DIA]: "09:00|09:30|1",
      [SlotKey.CITA_OFFERED]: JSON.stringify({ text: "Fechas", rows: [{ id: "old-date", title: "Anterior" }] }),
    },
    counters: { [CounterKey.CITA_BOOKING_FAILURES]: 2, [CounterKey.CITA_HORA_PAGE]: 2 },
  };
}

const rowsOf = (result: HandlerResult) => {
  const list = result.effects.find((effect) => effect.kind === SendType.INTERACTIVE_LIST);
  return list?.kind === SendType.INTERACTIVE_LIST ? list.rows : [];
};
const sinProgramacion = (session: Session) => session.slots[SlotKey.CITA_REFERENCIAS_SIN_PROGRAMACION];

describe.each([SessionChannel.WHATSAPP, SessionChannel.WEB])("agendar cita con referencia sin cupos en %s", (channel) => {
  const agendar = () => pending(channel, AppointmentMode.REFERENCE);
  const question = () => turn(agendar(), query(QueryKind.LIST_FECHAS, { status: CatalogStatus.EMPTY }));
  const expectQuestion = (result: HandlerResult) => {
    expect(result.session.state).toBe(SessionState.REFERENCIA_AWAITING_OTHER_REFERENCE);
    expect(result.effects.at(-1)).toEqual({
      kind: SendType.BUTTONS,
      text: CITA_REFERENCIA_SIN_FECHAS_TEXT,
      buttons: CITA_REFERENCIA_SIN_FECHAS_BUTTONS,
    });
  };

  it("pregunta si seguir con las referencias o con una cita médica y recuerda la referencia sin programación", () => {
    const result = question();

    expect(result.effects).toEqual([
      { kind: SendType.BUTTONS, text: CITA_REFERENCIA_SIN_FECHAS_TEXT, buttons: CITA_REFERENCIA_SIN_FECHAS_BUTTONS },
    ]);
    expect(CITA_REFERENCIA_SIN_FECHAS_TEXT).toBe(
      "No encontramos cupos disponibles para esta referencia. ¿Deseas continuar con tus referencias o con una cita médica?",
    );
    expect(CITA_REFERENCIA_SIN_FECHAS_BUTTONS).toEqual([
      { id: OtherReferenciaCitaButtonId.REFERENCES, title: "Referencias" },
      { id: OtherReferenciaCitaButtonId.NEW_APPOINTMENT, title: "Cita médica" },
    ]);
    expect(CITA_REFERENCIA_SIN_FECHAS_BUTTONS.every((button) => button.title.length <= 20)).toBe(true);
    expect(JSON.parse(String(sinProgramacion(result.session)))).toEqual([REFERENCES[0].idReferencia]);
    expect(queries(result)).toEqual([]);
  });

  it.each([tap(OtherReferenciaCitaButtonId.REFERENCES), text("Referencias"), text("referencia"), text("1")])(
    "%j vuelve a la lista sin la referencia que quedó sin programación",
    (event) => {
      const result = turn(question().session, event);

      expect(result.session.state).toBe(SessionState.CITA_AWAITING_REFERENCIA_SELECT);
      expect(queries(result)).toEqual([]);
      expect(rowsOf(result).map((row) => [row.id, row.disabled])).toEqual([[REFERENCES[1].idReferencia, undefined]]);
    },
  );

  it("la referencia sin programación ya no se puede elegir y repite la misma página sin consultar MINSA", () => {
    const listed = turn(question().session, tap(OtherReferenciaCitaButtonId.REFERENCES)).session;

    for (const event of [tap(REFERENCES[0].idReferencia), text("2")]) {
      const result = turn(listed, event);
      expect(result.session.state).toBe(SessionState.CITA_AWAITING_REFERENCIA_SELECT);
      expect(result.session.slots).toEqual(listed.slots);
      expect(result.session.counters).toEqual(listed.counters);
      expect(rowsOf(result)).toEqual(readOffered(listed.slots)?.rows);
      expect(queries(result)).toEqual([]);
    }
    const chosen = turn(listed, tap(REFERENCES[1].idReferencia));
    expect(queries(chosen)).toEqual([{ kind: QueryKind.LIST_FECHAS, payload: { codEess: "eess-1", especialidadId: "ups-1" } }]);
  });

  it.each([tap(OtherReferenciaCitaButtonId.NEW_APPOINTMENT), text("Cita médica"), text("cita"), text("nueva cita"), text("2")])(
    "%j sigue con una cita nueva sin pedir OTP ni conservar la referencia",
    (event) => {
      const result = turn(question().session, event);

      expect(result.session.state).toBe(SessionState.CITA_AWAITING_DISTRITO_AI);
      expect(result.session.slots[SlotKey.CITA_APPOINTMENT_MODE]).toBe(AppointmentMode.NEW);
      expect(result.session.slots[SlotKey.CITA_BEARER]).toBe("synthetic-token");
      expect(result.session.slots[SlotKey.CITA_DNI]).toBe("12345678");
      for (const key of [
        SlotKey.CITA_REFERENCIA_SELECCIONADA_ID,
        SlotKey.CITA_REFERENCIAS_DATA,
        SlotKey.CITA_REFERENCIAS_SIN_PROGRAMACION,
        SlotKey.CITA_COD_EESS,
        SlotKey.CITA_ESPECIALIDAD_ID,
        SlotKey.CITA_FECHA,
      ]) {
        expect(result.session.slots[key]).toBeUndefined();
      }
      expect(queries(result)).toEqual([]);
    },
  );

  it("si la única seleccionable quedó sin programación, Referencias continúa con una cita nueva", () => {
    const session = agendar();
    session.slots[SlotKey.CITA_REFERENCIAS_DATA] = JSON.stringify([REFERENCES[0], { ...REFERENCES[1], estado: 1 }]);
    const asked = turn(session, query(QueryKind.LIST_FECHAS, { status: CatalogStatus.EMPTY }));

    const result = turn(asked.session, tap(OtherReferenciaCitaButtonId.REFERENCES));

    expect(result.effects[0]).toEqual({ kind: SendType.TEXT, text: CITA_REFERENCIA_SIN_SELECCIONABLES_TEXT });
    expect(result.session.state).toBe(SessionState.CITA_AWAITING_DISTRITO_AI);
    expect(rowsOf(result)).toEqual([]);
  });

  it.each([text("no entiendo"), text("no"), tap(OtherReferenciaButtonId.YES), tap(OtherReferenciaButtonId.NO)])(
    "%j repite la pregunta de este camino sin elegir ni cerrar",
    (event) => {
      const result = turn(question().session, event);
      expectQuestion(result);
      expect(queries(result)).toEqual([]);
    },
  );

  it("salir escrito cierra como hoy y quiero salir pide confirmar y vuelve a la misma pregunta", () => {
    const closed = turn(question().session, text("salir"));
    expect(closed.session).toEqual({ state: SessionState.REFERENCIA_CLOSED, slots: {}, counters: {} });
    expect(closed.effects).toEqual([{ kind: SendType.TEXT, text: REFERENCIA_GOODBYE_TEXT }]);

    const exit = turn(question().session, text("quiero salir"));
    expect(exit.session.state).toBe(SessionState.CITA_AWAITING_EXIT_CONFIRM);
    expectQuestion(turn(exit.session, tap(ExitButtonId.NO)));
  });

  it("al vencer la sesión, Referencias vuelve a verificar y consulta referencias frescas sin la marca anterior", () => {
    const session = question().session;
    session.updatedAt = new Date(NOW - SESSION_IDLE_TIMEOUT_MS - 1);
    const expired = turn(session, tap(OtherReferenciaCitaButtonId.REFERENCES));
    expect(expired.session.state).toBe(SessionState.CITA_AWAITING_REAUTH);
    expect(expired.session.slots[SlotKey.POST_LOGIN_FLOW]).toBe(PostLoginFlow.CITA_REFERENCIAS);
    const accepted = turn(expired.session, tap(ReauthButtonId.YES));
    const verified = turn(
      { ...accepted.session, state: SessionState.CITA_VERIFY_PENDING },
      query(QueryKind.VERIFY_CODE, { status: VerifyCodeStatus.VERIFIED, token: "new-synthetic-token" }),
    );
    expect(sinProgramacion(verified.session)).toBeUndefined();
    const listed = turn(
      verified.session,
      query(QueryKind.LIST_REFERENCES, { statusReference: ReferenceStatus.FOUND, data: REFERENCES, message: "" }),
    );
    expect(listed.session.state).toBe(SessionState.CITA_AWAITING_REFERENCIA_SELECT);
    expect(rowsOf(listed).map((row) => row.disabled)).toEqual([undefined, undefined]);
  });

  it("una respuesta vencida vuelve a verificar y repite la pregunta de este camino", () => {
    const session = question().session;
    session.updatedAt = new Date(NOW - SESSION_IDLE_TIMEOUT_MS - 1);
    const expired = turn(session, text("no entiendo"));
    expect(expired.session.slots[SlotKey.CITA_RESUME_STATE]).toBe(SessionState.REFERENCIA_AWAITING_OTHER_REFERENCE);
    const accepted = turn(expired.session, tap(ReauthButtonId.YES));
    const verified = turn(
      { ...accepted.session, state: SessionState.CITA_VERIFY_PENDING },
      query(QueryKind.VERIFY_CODE, { status: VerifyCodeStatus.VERIFIED, token: "fresh-synthetic-token" }),
    );
    expect(verified.effects).toEqual([
      { kind: SendType.BUTTONS, text: CITA_REFERENCIA_SIN_FECHAS_TEXT, buttons: CITA_REFERENCIA_SIN_FECHAS_BUTTONS },
    ]);
    expect(verified.session.slots[SlotKey.CITA_BEARER]).toBe("fresh-synthetic-token");
  });
});

describe.each([SessionChannel.WHATSAPP, SessionChannel.WEB])("sin fechas con cupos en %s", (channel) => {
  it.each([
    { status: CatalogStatus.EMPTY },
    { status: CatalogStatus.FOUND, items: [] },
    { status: CatalogStatus.FOUND, items: [{ fechaCupo: "01/01/2099", cantidadCupos: 0 }] },
  ])("%j pregunta Sí/No sin volver automáticamente a las referencias", (response) => {
    const session = pending(channel);
    const before = structuredClone(session);
    const result = turn(session, query(QueryKind.LIST_FECHAS, response));
    expect(result.session.state).toBe(SessionState.REFERENCIA_AWAITING_OTHER_REFERENCE);
    expect(result.effects).toEqual([{ kind: SendType.BUTTONS, text: REFERENCIA_SIN_FECHAS_TEXT, buttons: CITA_REFERENCIA_OTHER_BUTTONS }]);
    expect(result.session.slots[SlotKey.CITA_OFFERED]).toBeUndefined();
    expect(result.session.slots[SlotKey.CITA_REFERENCIA_SELECCIONADA_ID]).toBe(REFERENCES[0].idReferencia);
    expect(session).toEqual(before);
  });

  it.each([tap(OtherReferenciaButtonId.YES), text("sí"), text("1")])(
    "%j muestra el listado y limpia la selección anterior sin perder identidad",
    (event) => {
      const session = askOtherReference(pending(channel)).session;
      const before = structuredClone(session);
      const result = turn(session, event);
      expect(result.session.state).toBe(SessionState.CITA_AWAITING_REFERENCIA_SELECT);
      expect(result.session.slots).toMatchObject({
        [SlotKey.CITA_BEARER]: "synthetic-token",
        [SlotKey.CITA_DNI]: "12345678",
        [SlotKey.CITA_REFERENCIAS_DATA]: JSON.stringify(REFERENCES),
      });
      for (const key of [
        SlotKey.CITA_REFERENCIA_SELECCIONADA_ID,
        SlotKey.CITA_FECHA,
        SlotKey.CITA_COD_EESS,
        SlotKey.CITA_ESPECIALIDAD_ID,
        SlotKey.CITA_HORA_CONFIRM_ID,
        SlotKey.CITA_HORAS_DIA,
      ]) {
        expect(result.session.slots[key]).toBeUndefined();
      }
      expect(result.session.counters).toEqual({});
      expect(queries(result)).toEqual([]);
      const chosen = turn(result.session, tap(REFERENCES[1].idReferencia));
      expect(queries(chosen)).toEqual([{ kind: QueryKind.LIST_FECHAS, payload: { codEess: "eess-1", especialidadId: "ups-1" } }]);
      expect(session).toEqual(before);
    },
  );

  it.each([tap(OtherReferenciaButtonId.NO), text("no"), text("2"), text("No, salir"), text("salir")])(
    "%j cierra limpiamente con la despedida existente",
    (event) => {
      const result = turn(askOtherReference(pending(channel)).session, event);
      expect(result.session).toEqual({ state: SessionState.REFERENCIA_CLOSED, slots: {}, counters: {} });
      expect(result.effects).toEqual([{ kind: SendType.TEXT, text: REFERENCIA_GOODBYE_TEXT }]);
    },
  );

  it.each([text("no entiendo"), tap("boton_desconocido"), tap("referencia_cita_offer_no"), tap(REFERENCES[1].idReferencia)])(
    "%j conserva la pregunta sin seleccionar ni cerrar",
    (event) => {
      const result = turn(askOtherReference(pending(channel)).session, event);
      expect(result.session.state).toBe(SessionState.REFERENCIA_AWAITING_OTHER_REFERENCE);
      expect(result.effects.at(-1)).toEqual({
        kind: SendType.BUTTONS,
        text: REFERENCIA_SIN_FECHAS_TEXT,
        buttons: CITA_REFERENCIA_OTHER_BUTTONS,
      });
      expect(queries(result)).toHaveLength(0);
    },
  );

  it("repite la pregunta tras el guard léxico y al rechazar una salida", () => {
    const session = askOtherReference(pending(channel)).session;
    const insult = turn(session, text("cojudos"));
    expect(insult.effects[0]).toEqual({ kind: SendType.TEXT, text: RESPECT_REMINDER_TEXT });
    expect(insult.effects.at(-1)).toEqual({
      kind: SendType.BUTTONS,
      text: REFERENCIA_SIN_FECHAS_TEXT,
      buttons: CITA_REFERENCIA_OTHER_BUTTONS,
    });
    const exit = turn(session, text("quiero salir"));
    expect(exit.session.state).toBe(SessionState.CITA_AWAITING_EXIT_CONFIRM);
    const resumed = turn(exit.session, tap(ExitButtonId.NO));
    expect(resumed.session.state).toBe(SessionState.REFERENCIA_AWAITING_OTHER_REFERENCE);
    expect(resumed.effects).toEqual([{ kind: SendType.BUTTONS, text: REFERENCIA_SIN_FECHAS_TEXT, buttons: CITA_REFERENCIA_OTHER_BUTTONS }]);
  });

  it("consultar referencia: Sí vuelve a la lista; WhatsApp omite la referencia sin cupos y la web la marca Sin programación", () => {
    const asked = turn(pending(channel), query(QueryKind.LIST_FECHAS, { status: CatalogStatus.EMPTY }));
    const listed = turn(asked.session, tap(OtherReferenciaButtonId.YES));
    const rows = rowsOf(listed);

    if (channel === SessionChannel.WHATSAPP) {
      expect(rows.map((row) => [row.id, row.disabled])).toEqual([[REFERENCES[1].idReferencia, undefined]]);
      return;
    }
    expect(rows.map((row) => [row.id, row.disabled])).toEqual([
      [REFERENCES[1].idReferencia, undefined],
      [REFERENCES[0].idReferencia, true],
    ]);
    expect(rows[1].description?.endsWith(REFERENCIA_SIN_PROGRAMACION_ETIQUETA)).toBe(true);
    const chosen = turn(listed.session, tap(REFERENCES[0].idReferencia));
    expect(chosen.effects[0]).toEqual({ kind: SendType.TEXT, text: REFERENCIA_SIN_PROGRAMACION_TEXT });
    expect(chosen.session.state).toBe(SessionState.CITA_AWAITING_REFERENCIA_SELECT);
  });

  it("con referencias bloqueadas el aviso sin cupos no cambia y Sí vuelve a la lista con las seleccionables primero", () => {
    const blocked: ReferenciaItem = { ...REFERENCES[1], idReferencia: "synthetic-blocked", estado: 1, estadoDescripcion: "PENDIENTE" };
    const session = pending(channel);
    session.slots[SlotKey.CITA_REFERENCIAS_DATA] = JSON.stringify([blocked, ...REFERENCES]);

    const noDates = turn(session, query(QueryKind.LIST_FECHAS, { status: CatalogStatus.EMPTY }));
    expect(noDates.effects).toEqual([{ kind: SendType.BUTTONS, text: REFERENCIA_SIN_FECHAS_TEXT, buttons: CITA_REFERENCIA_OTHER_BUTTONS }]);

    const listed = turn(noDates.session, tap(OtherReferenciaButtonId.YES));
    const list = listed.effects.find((effect) => effect.kind === SendType.INTERACTIVE_LIST);
    const rows = list?.kind === SendType.INTERACTIVE_LIST ? list.rows : [];
    const web: [string, boolean | undefined][] = [
      [REFERENCES[1].idReferencia, undefined],
      ["synthetic-blocked", true],
      [REFERENCES[0].idReferencia, true],
    ];
    expect(rows.map((row) => [row.id, row.disabled])).toEqual(channel === SessionChannel.WEB ? web : web.slice(0, 1));
  });

  it("no presenta el aviso sin cupos ante error técnico ni falta de horarios de una fecha", () => {
    const technical = turn(pending(channel), query(QueryKind.LIST_FECHAS, { status: CatalogStatus.ERROR }));
    expect(technical.session.state).toBe(SessionState.CITA_AWAITING_REFERENCIA_SELECT);
    const hours = turn(
      { ...pending(channel), state: SessionState.CITA_HORA_PENDING },
      query(QueryKind.LIST_HORAS, { status: CatalogStatus.EMPTY }),
    );
    expect(hours.session.state).toBe(SessionState.CITA_AWAITING_OTHER_FECHA);
    expect(queries(hours)).toHaveLength(0);
  });
});

describe("vencimiento de la pregunta para seleccionar otra referencia", () => {
  it("registra el estado como autenticado", () => {
    expect(AUTHENTICATED_WAITING_STATES).toContain(SessionState.REFERENCIA_AWAITING_OTHER_REFERENCE);
  });

  it.each([SessionChannel.WHATSAPP, SessionChannel.WEB])(
    "Sí con sesión expirada en %s valida de nuevo y consulta referencias frescas",
    (channel) => {
      const session = askOtherReference(pending(channel)).session;
      session.updatedAt = new Date(NOW - SESSION_IDLE_TIMEOUT_MS - 1);
      const expired = turn(session, tap(OtherReferenciaButtonId.YES));
      expect(expired.session.state).toBe(SessionState.CITA_AWAITING_REAUTH);
      expect(expired.session.slots[SlotKey.POST_LOGIN_FLOW]).toBe(PostLoginFlow.REFERENCIAS);
      expect(expired.session.slots[SlotKey.CITA_APPOINTMENT_MODE]).toBeUndefined();
      expect(expired.session.slots[SlotKey.CITA_REFERENCIA_SELECCIONADA_ID]).toBeUndefined();
      expect(expired.session.slots[SlotKey.CITA_BEARER]).toBeUndefined();
      const accepted = turn(expired.session, tap(ReauthButtonId.YES));
      expect(queries(accepted).map((effect) => effect.kind)).toEqual([QueryKind.VALIDATE_USER]);
      const verified = turn(
        { ...accepted.session, state: SessionState.CITA_VERIFY_PENDING },
        query(QueryKind.VERIFY_CODE, { status: VerifyCodeStatus.VERIFIED, token: "new-synthetic-token" }),
      );
      expect(queries(verified)).toEqual([
        { kind: QueryKind.LIST_REFERENCES, payload: { numeroDocumento: "12345678", tipoDocumento: "01" } },
      ]);
      const listed = turn(
        verified.session,
        query(QueryKind.LIST_REFERENCES, { statusReference: ReferenceStatus.FOUND, data: REFERENCES, message: "" }),
      );
      expect(listed.session.state).toBe(SessionState.CITA_AWAITING_REFERENCIA_SELECT);
      expect(queries(listed)).toHaveLength(0);
    },
  );

  it.each([tap(OtherReferenciaButtonId.NO), text("no"), text("2")])("%j cierra sin exigir OTP aunque haya expirado", (event) => {
    const session = askOtherReference(pending(SessionChannel.WHATSAPP)).session;
    session.updatedAt = new Date(NOW - SESSION_IDLE_TIMEOUT_MS - 1);
    const result = turn(session, event);
    expect(result.session).toEqual({ state: SessionState.REFERENCIA_CLOSED, slots: {}, counters: {} });
    expect(result.effects).toEqual([{ kind: SendType.TEXT, text: REFERENCIA_GOODBYE_TEXT }]);
  });

  it.each([SessionChannel.WHATSAPP, SessionChannel.WEB])(
    "una respuesta ambigua vencida en %s requiere OTP y vuelve a la pregunta antes de listar",
    (channel) => {
      const session = askOtherReference(pending(channel)).session;
      session.updatedAt = new Date(NOW - SESSION_IDLE_TIMEOUT_MS - 1);
      const expired = turn(session, text("no entiendo"));
      expect(expired.session.state).toBe(SessionState.CITA_AWAITING_REAUTH);
      expect(expired.session.slots[SlotKey.CITA_RESUME_STATE]).toBe(SessionState.REFERENCIA_AWAITING_OTHER_REFERENCE);
      expect(queries(expired)).toHaveLength(0);
      const accepted = turn(expired.session, tap(ReauthButtonId.YES));
      const verified = turn(
        { ...accepted.session, state: SessionState.CITA_VERIFY_PENDING },
        query(QueryKind.VERIFY_CODE, { status: VerifyCodeStatus.VERIFIED, token: "fresh-synthetic-token" }),
      );
      expect(verified.session.state).toBe(SessionState.REFERENCIA_AWAITING_OTHER_REFERENCE);
      expect(verified.effects).toEqual([
        {
          kind: SendType.BUTTONS,
          text: REFERENCIA_SIN_FECHAS_TEXT,
          buttons: CITA_REFERENCIA_OTHER_BUTTONS,
        },
      ]);
      expect(queries(verified)).toHaveLength(0);
      expect(verified.session.slots[SlotKey.CITA_BEARER]).toBe("fresh-synthetic-token");
      const listed = turn(verified.session, tap(OtherReferenciaButtonId.YES));
      expect(listed.session.state).toBe(SessionState.CITA_AWAITING_REFERENCIA_SELECT);
      expect(queries(listed)).toHaveLength(0);
      expect(listed.session.slots[SlotKey.CITA_BEARER]).toBe("fresh-synthetic-token");
    },
  );

  it("la excepción de cierre solo aplica al estado correspondiente y nunca a resultados internos", () => {
    expect(handleOtherReferenceClose(pending(SessionChannel.WEB), tap(OtherReferenciaButtonId.NO))).toBeUndefined();
    const session = askOtherReference(pending(SessionChannel.WEB)).session;
    expect(handleOtherReferenceClose(session, query(QueryKind.LIST_FECHAS, {}))).toBeUndefined();
    expect(handleOtherReference(session, tap("desconocido")).session.state).toBe(SessionState.REFERENCIA_AWAITING_OTHER_REFERENCE);
  });
});
