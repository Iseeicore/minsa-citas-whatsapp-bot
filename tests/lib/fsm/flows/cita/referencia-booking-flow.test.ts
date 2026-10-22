import { describe, expect, it } from "vitest";
import { handle } from "@/lib/fsm/core/handlers";
import { isQueryEffect } from "@/lib/fsm/core/handlers-shared";
import type { HandlerResult, QueryEffect, QueryResultEvent, SendEffect, Session } from "@/lib/fsm/core/types";
import { startBooking } from "@/lib/fsm/flows/cita/steps/hora/ask-or-book";
import { SlotKey } from "@/lib/enums/slot-key";
import { InternalEventType } from "@/lib/enums/internal-event-type";
import { SessionChannel } from "@/lib/enums/session-channel";
import { HoraConfirmButtonId } from "@/lib/enums/hora-confirm-button-id";
import type { ReferenciaItem } from "@/lib/integrations/minsa/types";
import { REFERENCIA_SIN_FECHAS_TEXT } from "@/lib/constants/textos/cita-reserva";
import { AppointmentMode } from "@/lib/enums/appointment-mode";
import { CounterKey } from "@/lib/enums/counter-key";
import { OtherReferenciaButtonId } from "@/lib/enums/other-referencia-button-id";

const WEB_REFERENCIAS: ReferenciaItem[] = [
  { id: "1364486", destino: "5987", ups: "222800", especialidad: "GASTROENTEROLOGÍA" },
  { id: "222", destino: "777", ups: "070", especialidad: "CARDIOLOGÍA" },
].map(({ id, destino, ups, especialidad }) => ({
  idReferencia: id,
  numero: id,
  codigoIpressDestino: destino,
  codigoUpsDestino: ups,
  upsDestino: especialidad,
  ipressDestino: `HOSPITAL ${destino}`,
  fechaInicio: "24/07/2024 23:03",
  ipressOrigen: "CENTRO DE ORIGEN",
  upsOrigen: "MEDICINA GENERAL",
  estado: 3,
}));

const FROM = "sandbox-referencia-booking";

const fechasResult = (result: unknown): QueryResultEvent => ({
  from: FROM,
  type: InternalEventType.QUERY_RESULT,
  queryKind: "list_fechas",
  result,
});

const sent = (result: HandlerResult): SendEffect[] => result.effects.filter((effect): effect is SendEffect => !isQueryEffect(effect));
const texts = (result: HandlerResult): string =>
  sent(result)
    .map((e) => ("text" in e ? e.text : ""))
    .join("\n");
const queries = (result: HandlerResult): QueryEffect[] => result.effects.filter((effect): effect is QueryEffect => isQueryEffect(effect));

function fechaPending(withReferencia: boolean): Session {
  return {
    state: "cita_fecha_pending",
    slots: {
      [SlotKey.CITA_BEARER]: "token",
      [SlotKey.CITA_DNI]: "12345678",
      [SlotKey.CITA_COD_EESS]: "5987",
      [SlotKey.CITA_ESPECIALIDAD_ID]: "222800",
      ...(withReferencia ? { [SlotKey.CITA_REFERENCIA_SELECCIONADA_ID]: "1364486" } : {}),
    },
    counters: {},
  };
}

describe("referencia médica: no hay fechas con cupo en el destino", () => {
  it("pregunta antes de recuperar las referencias cuando no queda una lista guardada", () => {
    const result = handle(fechaPending(true), fechasResult({ status: "empty" }));

    expect(result.session.state).toBe("referencia_awaiting_other_reference");
    const mensaje = texts(result);
    expect(mensaje).toContain(REFERENCIA_SIN_FECHAS_TEXT);
    expect(result.session.slots[SlotKey.CITA_BEARER]).toBe("token");
    expect(queries(result)).toHaveLength(0);
    const accepted = handle(result.session, { from: FROM, type: "button", listId: OtherReferenciaButtonId.YES });
    expect(accepted.session.state).toBe("referencia_awaiting_lookup_retry");
  });

  it("también cuando MINSA responde found con la lista vacía", () => {
    const result = handle(fechaPending(true), fechasResult({ status: "found", items: [] }));

    expect(result.session.state).toBe("referencia_awaiting_other_reference");
  });

  it("en una cita normal el comportamiento no cambia: no se cierra con el mensaje de referencia", () => {
    const result = handle(fechaPending(false), fechasResult({ status: "empty" }));

    expect(texts(result)).not.toContain("referencia médica");
    expect(result.session.state).not.toBe("cita_declined_closed");
  });

  it("si hay fechas, las muestra como siempre", () => {
    const result = handle(
      fechaPending(true),
      fechasResult({
        status: "found",
        items: [
          { fechaCupo: "07/10/2026", cantidadCupos: 2 },
          { fechaCupo: "08/10/2026", cantidadCupos: 1 },
        ],
      }),
    );

    expect(result.session.state).toBe("cita_awaiting_fecha_select");
  });
});

describe("referencia médica: al agendar", () => {
  const bookingPayload = (session: Session) => {
    const result = startBooking(session, "18:00");
    return queries(result).find((effect) => effect.kind === "book_appointment")?.payload;
  };

  it("con una referencia elegida, envía su identificador", () => {
    const session = fechaPending(true);
    session.slots[SlotKey.CITA_FECHA] = "07/10/2026";

    expect(bookingPayload(session)).toMatchObject({
      codigoRenipress: "5987",
      codigoUps: "222800",
      numeroDocumentoPaciente: "12345678",
      referenciaId: "1364486",
    });
  });

  it("en una cita normal, el pedido no incluye referenciaId", () => {
    const session = fechaPending(false);
    session.slots[SlotKey.CITA_FECHA] = "07/10/2026";

    expect(bookingPayload(session)).not.toHaveProperty("referenciaId");
  });
});

describe("referencia médica web: recuperar disponibilidad sin cambiar el destino", () => {
  const webFechaPending = (): Session => ({
    ...fechaPending(true),
    channel: SessionChannel.WEB,
    slots: {
      ...fechaPending(true).slots,
      [SlotKey.CITA_REFERENCIAS_DATA]: JSON.stringify(WEB_REFERENCIAS),
      [SlotKey.CITA_APPOINTMENT_MODE]: AppointmentMode.REFERENCE,
    },
  });

  it.each([
    { status: "empty" },
    { status: "found", items: [] },
    { status: "found", items: [{ fechaCupo: "07/10/2099", cantidadCupos: 0 }] },
  ])("sin disponibilidad (%j) pregunta si desea otra referencia antes de volver al listado", (response) => {
    const session = webFechaPending();
    session.counters[CounterKey.CITA_BOOKING_FAILURES] = 2;
    const original = structuredClone(session);

    const result = handle(session, fechasResult(response));

    expect(result.session.state).toBe("referencia_awaiting_other_reference");
    expect(texts(result)).toContain(REFERENCIA_SIN_FECHAS_TEXT);
    expect(queries(result)).toHaveLength(0);
    expect(result.session.slots[SlotKey.CITA_BEARER]).toBe("token");
    expect(result.session.slots[SlotKey.CITA_DNI]).toBe("12345678");
    const accepted = handle(result.session, { from: FROM, type: "button", listId: OtherReferenciaButtonId.YES });
    expect(accepted.session.state).toBe("cita_awaiting_referencia_select");
    expect(accepted.session.slots[SlotKey.CITA_COD_EESS]).toBeUndefined();
    expect(accepted.session.slots[SlotKey.CITA_ESPECIALIDAD_ID]).toBeUndefined();
    expect(accepted.session.slots[SlotKey.CITA_REFERENCIA_SELECCIONADA_ID]).toBeUndefined();
    expect(accepted.session.counters[CounterKey.CITA_BOOKING_FAILURES]).toBeUndefined();
    const retried = handle(accepted.session, { from: FROM, type: "list", listId: "222" });
    expect(queries(retried)).toEqual([{ kind: "list_fechas", payload: { codEess: "777", especialidadId: "070" } }]);
    expect(retried.session.slots[SlotKey.CITA_REFERENCIA_SELECCIONADA_ID]).toBe("222");
    expect(session).toEqual(original);
  });

  it("si se agotaron las fechas restantes permite cambiar de referencia", () => {
    const session = webFechaPending();
    session.slots[SlotKey.CITA_FECHAS_DESCARTADAS] = "07/10/2099";

    const result = handle(session, fechasResult({ status: "found", items: [{ fechaCupo: "07/10/2099", cantidadCupos: 1 }] }));

    expect(result.session.state).toBe("referencia_awaiting_other_reference");
    const accepted = handle(result.session, { from: FROM, type: "button", listId: OtherReferenciaButtonId.YES });
    expect(accepted.session.slots[SlotKey.CITA_FECHAS_DESCARTADAS]).toBeUndefined();
    expect(queries(result)).toHaveLength(0);
  });

  it("un error técnico permite reintentar y no se presenta como ausencia de cupos", () => {
    const result = handle(webFechaPending(), fechasResult({ status: "error" }));

    expect(result.session.state).toBe("cita_awaiting_referencia_select");
    expect(texts(result)).not.toContain(REFERENCIA_SIN_FECHAS_TEXT);
    expect(queries(result)).toHaveLength(0);
    const retried = handle(result.session, { from: FROM, type: "list", listId: "1364486" });
    expect(queries(retried)).toEqual([{ kind: "list_fechas", payload: { codEess: "5987", especialidadId: "222800" } }]);
  });

  it("una sesión no autorizada pide validación y no la confunde con falta de disponibilidad", () => {
    const result = handle(webFechaPending(), fechasResult({ status: "unauthorized" }));

    expect(result.session.state).toBe("cita_awaiting_dni");
    expect(result.session.slots[SlotKey.CITA_BEARER]).toBeUndefined();
    expect(texts(result)).not.toContain(REFERENCIA_SIN_FECHAS_TEXT);
    expect(queries(result)).toHaveLength(0);
  });

  it.each(["cita_hora_pending", "cita_hora_page_pending"] as const)(
    "en %s excluye los horarios agotados y conserva los códigos de la referencia sin mutar la sesión",
    (state) => {
      const session = webFechaPending();
      session.state = state;
      session.slots[SlotKey.CITA_FECHA] = "07/10/2099";
      const original = structuredClone(session);

      const result = handle(session, {
        from: FROM,
        type: InternalEventType.QUERY_RESULT,
        queryKind: "list_horas",
        result: {
          status: "found",
          items: [
            { horaInicio: "08:00", horaFin: "08:30", cantidadCupos: 0 },
            { horaInicio: "09:00", horaFin: "09:30", cantidadCupos: 1 },
            { horaInicio: "10:00", horaFin: "10:30", cantidadCupos: 2 },
          ],
        },
      });

      expect(result.session.state).toBe("cita_awaiting_hora_select");
      const list = sent(result).find((effect) => effect.kind === "send_interactive_list");
      expect(list?.kind === "send_interactive_list" && list.rows.map((row) => row.id)).toEqual(["09:00|09:30", "10:00|10:30"]);
      expect(result.session.slots[SlotKey.CITA_COD_EESS]).toBe("5987");
      expect(result.session.slots[SlotKey.CITA_ESPECIALIDAD_ID]).toBe("222800");
      expect(queries(result)).toHaveLength(0);
      expect(session).toEqual(original);
    },
  );

  it.each([
    { status: "empty", items: [] },
    { status: "found", items: [{ horaInicio: "08:00", horaFin: "08:30", cantidadCupos: 0 }] },
  ])("sin horarios disponibles (%j) permite cambiar de fecha conservando referencia y destino", (response) => {
    const session = webFechaPending();
    session.state = "cita_hora_pending";
    session.slots[SlotKey.CITA_FECHA] = "07/10/2099";

    const result = handle(session, { from: FROM, type: InternalEventType.QUERY_RESULT, queryKind: "list_horas", result: response });

    expect(result.session.state).toBe("cita_awaiting_other_fecha");
    expect(result.session.slots[SlotKey.CITA_REFERENCIA_SELECCIONADA_ID]).toBe("1364486");
    expect(result.session.slots[SlotKey.CITA_COD_EESS]).toBe("5987");
    expect(result.session.slots[SlotKey.CITA_ESPECIALIDAD_ID]).toBe("222800");
    expect(queries(result)).toHaveLength(0);
  });

  it.each(["cita_hora_pending", "cita_hora_page_pending"] as const)(
    "un error técnico en %s devuelve las referencias sin presentarlo como falta de cupos",
    (state) => {
      const session = webFechaPending();
      session.state = state;
      session.slots[SlotKey.CITA_FECHA] = "07/10/2099";

      const result = handle(session, {
        from: FROM,
        type: InternalEventType.QUERY_RESULT,
        queryKind: "list_horas",
        result: { status: "error" },
      });

      expect(result.session.state).toBe("cita_awaiting_referencia_select");
      expect(texts(result)).not.toContain("No hay horarios disponibles");
      expect(result.session.slots[SlotKey.CITA_BEARER]).toBe("token");
      expect(result.session.slots[SlotKey.CITA_FECHA]).toBeUndefined();
      expect(queries(result)).toHaveLength(0);
      const retried = handle(result.session, { from: FROM, type: "list", listId: "222" });
      expect(queries(retried)).toEqual([{ kind: "list_fechas", payload: { codEess: "777", especialidadId: "070" } }]);
    },
  );

  it("WhatsApp filtra horarios sin cupos y permite cambiar de referencia ante un error técnico", () => {
    const session = webFechaPending();
    session.channel = SessionChannel.WHATSAPP;
    session.state = "cita_hora_pending";
    session.slots[SlotKey.CITA_FECHA] = "07/10/2099";
    const event: QueryResultEvent = {
      from: FROM,
      type: InternalEventType.QUERY_RESULT,
      queryKind: "list_horas",
      result: {
        status: "found",
        items: [
          { horaInicio: "08:00", horaFin: "08:30", cantidadCupos: 0 },
          { horaInicio: "09:00", horaFin: "09:30", cantidadCupos: 1 },
        ],
      },
    };

    const result = handle(session, event);
    expect(result.session.state).toBe("cita_awaiting_hora_confirm");
    expect(result.session.slots[SlotKey.CITA_HORA_CONFIRM_ID]).toBe("09:00|09:30");
    expect(queries(result)).toHaveLength(0);
    const failed = handle(session, { ...event, result: { status: "error" } });
    expect(failed.session.state).toBe("cita_awaiting_referencia_select");
  });
});

describe("referencia médica: confirmación final en el chat web", () => {
  const horaSession = (channel: Session["channel"] = SessionChannel.WEB, withReferencia = true): Session => ({
    ...fechaPending(withReferencia),
    channel,
    state: "cita_awaiting_hora_select",
    slots: {
      ...fechaPending(withReferencia).slots,
      [SlotKey.CITA_FECHA]: "07/10/2099",
      [SlotKey.CITA_ESPECIALIDAD_NOMBRE]: "GASTROENTEROLOGÍA",
      [SlotKey.CITA_ESTABLECIMIENTO_NOMBRE]: "HOSPITAL MARIA AUXILIADORA",
      [SlotKey.CITA_REFERENCIAS_DATA]: JSON.stringify([{ idReferencia: "1364486", numero: "00123" }]),
      [SlotKey.CITA_OFFERED]: JSON.stringify({ text: "Selecciona el horario:", rows: [{ id: "18:00|18:30", title: "6:00 PM - 6:30 PM" }] }),
    },
  });
  const tap = (listId: string) => ({ from: FROM, type: "button" as const, listId });

  it.each(["07/10/2099", "20991007"])("tocar un horario muestra la fecha %s legible y no reserva hasta confirmar", (fecha) => {
    const session = horaSession();
    session.slots[SlotKey.CITA_FECHA] = fecha;

    const asked = handle(session, tap("18:00|18:30"));

    expect(asked.session.state).toBe("cita_awaiting_hora_confirm");
    expect(queries(asked)).toHaveLength(0);
    expect(texts(asked)).toContain("Referencia: 00123");
    expect(texts(asked)).toContain("Especialidad: GASTROENTEROLOGÍA");
    expect(texts(asked)).toContain("Establecimiento: HOSPITAL MARIA AUXILIADORA");
    expect(texts(asked)).toContain("7 de octubre (2099)");
    expect(texts(asked)).toContain("Horario: 6:00 - 6:30 PM");

    const confirmed = handle(asked.session, tap(HoraConfirmButtonId.YES));

    expect(confirmed.session.state).toBe("cita_booking_pending");
    expect(queries(confirmed)).toEqual([
      {
        kind: "book_appointment",
        payload: {
          codigoRenipress: "5987",
          codigoUps: "222800",
          fechaCita: fecha,
          horaInicio: "18:00",
          numeroDocumentoPaciente: "12345678",
          referenciaId: "1364486",
        },
      },
    ]);
  });

  it("un segundo toque del horario no se interpreta como confirmación", () => {
    const asked = handle(horaSession(), tap("18:00|18:30"));

    const repeated = handle(asked.session, tap("18:00|18:30"));

    expect(repeated.session.state).toBe("cita_awaiting_hora_confirm");
    expect(queries(repeated)).toHaveLength(0);
  });

  it("rechazar el resumen conserva referencia y destino al volver a los horarios", () => {
    const asked = handle(horaSession(), tap("18:00|18:30"));

    const result = handle(asked.session, tap(HoraConfirmButtonId.NO));

    expect(result.session.state).toBe("cita_awaiting_hora_select");
    expect(queries(result)).toHaveLength(0);
    expect(result.session.slots[SlotKey.CITA_COD_EESS]).toBe("5987");
    expect(result.session.slots[SlotKey.CITA_ESPECIALIDAD_ID]).toBe("222800");
    expect(result.session.slots[SlotKey.CITA_REFERENCIA_SELECCIONADA_ID]).toBe("1364486");
  });

  it.each(["hora_choice_a", "hora_choice_b"])("resolver una ambigüedad de hora con %s también exige confirmación", (id) => {
    const session = horaSession();
    session.state = "cita_awaiting_hora_choice";
    session.slots[SlotKey.CITA_HORA_CHOICE_A] = "18:00|18:30";
    session.slots[SlotKey.CITA_HORA_CHOICE_B] = "19:00|19:30|1";

    const result = handle(session, tap(id));

    expect(result.session.state).toBe("cita_awaiting_hora_confirm");
    expect(queries(result)).toHaveLength(0);
  });

  it("las citas nuevas de ambos canales conservan su reserva habitual al tocar un horario", () => {
    for (const session of [horaSession(SessionChannel.WHATSAPP, false), horaSession(SessionChannel.WEB, false)]) {
      const result = handle(session, tap("18:00|18:30"));

      expect(result.session.state).toBe("cita_booking_pending");
      expect(queries(result)[0]?.kind).toBe("book_appointment");
    }
  });

  it("un único horario recibido por el canal web incluye el resumen aunque la sesión persistida no tenga canal", () => {
    const session = horaSession();
    delete session.channel;
    session.state = "cita_hora_pending";

    const result = handle(session, {
      from: FROM,
      channel: SessionChannel.WEB,
      type: InternalEventType.QUERY_RESULT,
      queryKind: "list_horas",
      result: { status: "found", items: [{ horaInicio: "18:00", horaFin: "18:30", cantidadCupos: 1 }] },
    });

    expect(result.session.state).toBe("cita_awaiting_hora_confirm");
    expect(texts(result)).toContain("Referencia: 00123");
    expect(queries(result)).toHaveLength(0);
  });

  it("si MINSA informa una cita activa, vuelve a elegir sin cambiar silenciosamente especialidad ni destino", () => {
    const session = horaSession();
    session.state = "cita_booking_pending";

    const result = handle(session, {
      from: FROM,
      type: InternalEventType.QUERY_RESULT,
      queryKind: "book_appointment",
      result: { status: "duplicate" },
    });

    expect(result.session.state).toBe("referencia_awaiting_appointment_mode");
    expect(queries(result)).toHaveLength(0);
    expect(texts(result)).toContain("ya tienes una cita activa");
    expect(result.session.slots[SlotKey.CITA_COD_EESS]).toBe("5987");
    expect(result.session.slots[SlotKey.CITA_ESPECIALIDAD_ID]).toBe("222800");
    expect(result.session.slots[SlotKey.CITA_REFERENCIA_SELECCIONADA_ID]).toBe("1364486");
  });

  it("una cita duplicada del canal web conserva el destino aunque la sesión persistida no tenga canal", () => {
    const session = horaSession();
    delete session.channel;
    session.state = "cita_booking_pending";

    const result = handle(session, {
      from: FROM,
      channel: SessionChannel.WEB,
      type: InternalEventType.QUERY_RESULT,
      queryKind: "book_appointment",
      result: { status: "duplicate" },
    });

    expect(result.session.state).toBe("referencia_awaiting_appointment_mode");
    expect(result.session.slots[SlotKey.CITA_COD_EESS]).toBe("5987");
    expect(result.session.slots[SlotKey.CITA_ESPECIALIDAD_ID]).toBe("222800");
    expect(queries(result)).toHaveLength(0);
  });
});
