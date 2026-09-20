import { describe, expect, it } from "vitest";
import { matchFechaText } from "./date-parser";
import { handle } from "./handlers";
import { isQueryEffect } from "./handlers-shared";
import { serializeOffered, type OfferedRow } from "./selection-matchers";
import type { HandlerResult, InboundEvent, QueryResultEvent, SendEffect, Session } from "./types";

const FROM = "sandbox-confirmation";
const text = (value: string): InboundEvent => ({ from: FROM, type: "text", text: value });
const tap = (id: string): InboundEvent => ({ from: FROM, type: "button", listId: id });
const bookingResult = (result: unknown): QueryResultEvent => ({
  from: FROM,
  type: "query_result",
  queryKind: "book_appointment",
  result,
});

const queries = (result: HandlerResult) => result.effects.filter(isQueryEffect);
const sent = (result: HandlerResult): SendEffect[] =>
  result.effects.filter((effect): effect is SendEffect => !isQueryEffect(effect));

const HORA_ROWS: OfferedRow[] = [
  { id: "13:00|13:05", title: "13:00 - 13:05" },
  { id: "13:45|13:50", title: "13:45 - 13:50" },
];

function confirming(): Session {
  return {
    state: "cita_awaiting_hora_confirm",
    slots: {
      citaBearer: "token",
      citaDni: "12345678",
      citaCodEess: "0000123",
      citaEspecialidadId: "02",
      citaFecha: "31/12/2099",
      citaHoraConfirmId: "13:45|13:50",
      citaOffered: serializeOffered({ text: "Selecciona el horario:", rows: HORA_ROWS }),
    },
    counters: {},
  };
}

describe("typed yes/no in «¿Confirmas el horario 13:45 - 13:50?»", () => {
  it.each(["Si por favor", "sí por favor", "dale", "ok", "de acuerdo", "1"])("%j books the confirmed horario", (typed) => {
    const result = handle(confirming(), text(typed));

    expect(result.session.state).toBe("cita_booking_pending");
    expect(queries(result)).toEqual([
      {
        kind: "book_appointment",
        payload: {
          codigoRenipress: "0000123",
          codigoUps: "02",
          fechaCita: "31/12/2099",
          horaInicio: "13:45",
          numeroDocumentoPaciente: "12345678",
        },
      },
    ]);
  });

  it.each(["no", "No, gracias", "otro horario", "ver mas", "cambiar", "2"])("%j goes back to the list", (typed) => {
    const result = handle(confirming(), text(typed));

    expect(result.session.state).toBe("cita_awaiting_hora_select");
    expect(queries(result)).toHaveLength(0);
    expect(result.session.slots.citaHoraConfirmId).toBeUndefined();
  });

  it("asks again, without booking, when the reply is neither", () => {
    const result = handle(confirming(), text("si pero mejor a las 3"));

    expect(result.session.state).toBe("cita_awaiting_hora_confirm");
    expect(queries(result)).toHaveLength(0);
    expect(sent(result)[0].kind).toBe("send_buttons");
  });

  it("still books on the button", () => {
    expect(handle(confirming(), tap("hora_confirm_si")).session.state).toBe("cita_booking_pending");
  });
});

describe("typed yes/no when the session expired", () => {
  const waiting = (): Session => ({
    state: "cita_awaiting_reauth",
    slots: { citaDni: "12345678", citaResumeState: "cita_hora_pending" },
    counters: {},
  });

  it("«si por favor» asks for a new code", () => {
    const result = handle(waiting(), text("si por favor"));

    expect(result.session.state).toBe("cita_validate_pending");
    expect(queries(result)).toEqual([{ kind: "validate_user", payload: { numeroDocumento: "12345678" } }]);
  });

  it("«no, gracias» goes back to the menu", () => {
    expect(handle(waiting(), text("no, gracias")).session.state).toBe("main_menu");
  });
});

describe("a booking that MINSA does not accept", () => {
  const booking = (counters: Session["counters"] = {}): Session => ({
    state: "cita_booking_pending",
    slots: {
      citaBearer: "token",
      citaDni: "12345678",
      citaCodEess: "0000123",
      citaEspecialidadId: "02",
      citaFecha: "31/12/2099",
    },
    counters,
  });

  const RELIST = [{ kind: "list_horas", payload: { codEess: "0000123", especialidadId: "02", fecha: "31/12/2099" } }];

  it.each([
    ["an HTTP error", { status: "error" }],
    ["a 200 without a reason", { status: "rejected", message: "" }],
    ["a quota that was taken", { status: "rejected", message: "El cupo seleccionado ya no está disponible" }],
  ])("%s offers the same day's horarios again instead of closing", (_label, result) => {
    const step = handle(booking(), bookingResult(result));

    expect(step.session.state).toBe("cita_hora_pending");
    expect(step.session.counters.citaBookingFailures).toBe(1);
    expect(queries(step)).toEqual(RELIST);
    expect(sent(step)[0]).toMatchObject({ kind: "send_text" });
  });

  it("gives up after three failures so a systematic error cannot loop", () => {
    const step = handle(booking({ citaBookingFailures: 2 }), bookingResult({ status: "error" }));

    expect(step.session.state).toBe("cita_booking_rejected");
    expect(queries(step)).toHaveLength(0);
    expect(sent(step)[0]).toMatchObject({ text: "No pudimos agendar tu cita. Intenta de nuevo más tarde." });
  });

  it("still closes with MINSA's own reason when it is not about the horario", () => {
    const step = handle(booking(), bookingResult({ status: "rejected", message: "Paciente fuera del rango de edad" }));

    expect(step.session.state).toBe("cita_booking_rejected");
    expect(sent(step)[0]).toMatchObject({ text: "Paciente fuera del rango de edad" });
  });

  it("leaves duplicates and successes as they were", () => {
    expect(handle(booking(), bookingResult({ status: "duplicate", message: "Ya tiene una cita activa" })).session.state).toBe(
      "cita_booking_duplicate",
    );
    expect(handle(booking(), bookingResult({ status: "booked", url: "https://x.test", message: "ok" })).session.state).toBe(
      "cita_booked",
    );
  });
});

describe("typed dates against the dates MINSA offered", () => {
  const rows: OfferedRow[] = ["20/09/2026", "21/09/2026", "22/09/2026", "23/09/2026"].map((id) => ({ id, title: id }));
  const today = { year: 2026, month: 9, day: 20 }; // Sunday

  it.each([
    ["para hoy", "20/09/2026"],
    ["mañana", "21/09/2026"],
    ["pasado mañana", "22/09/2026"],
    ["para el martes", "22/09/2026"],
    ["para el 22", "22/09/2026"],
  ])("%j picks %s", (typed, expected) => {
    expect(matchFechaText(typed, rows, today)).toMatchObject({ kind: "match", row: { id: expected } });
  });
});
