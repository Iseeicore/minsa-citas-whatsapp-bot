import { describe, expect, it } from "vitest";
import { handle } from "@/lib/fsm/core/handlers";
import { startBooking } from "@/lib/fsm/flows/cita/steps/hora/ask-or-book";
import { findButtonReprompt } from "@/lib/fsm/flows/shared/button-reprompts";
import type { Session } from "@/lib/fsm/core/types";
import { BookingRetryButtonId } from "@/lib/enums/booking-retry-button-id";
import { CounterKey } from "@/lib/enums/counter-key";
import { SessionState } from "@/lib/enums/session-state";
import { SlotKey } from "@/lib/enums/slot-key";
import { queries, queryResult, sent, tap, text, texts } from "@/tests/support/fsm-events";

const OUTAGE_PROMPT = {
  kind: "send_buttons",
  text: "En este momento el servicio tiene problemas. Por favor, inténtalo más tarde.",
  buttons: [
    { id: BookingRetryButtonId.RETRY, title: "Reintentar" },
    { id: BookingRetryButtonId.EXIT, title: "Salir" },
  ],
};

function booking(counters: Session["counters"] = {}): Session {
  return {
    state: SessionState.CITA_BOOKING_PENDING,
    slots: {
      [SlotKey.CITA_BEARER]: "token",
      [SlotKey.CITA_DNI]: "12345678",
      [SlotKey.CITA_ESPECIALIDAD_ID]: "E1",
      [SlotKey.CITA_COD_EESS]: "0000123",
      [SlotKey.CITA_FECHA]: "31/12/2099",
      [SlotKey.CITA_HORA_RESERVA]: "09:00",
    },
    counters,
  };
}

const outage = (session: Session = booking()) => handle(session, queryResult("book_appointment", { status: "unavailable" }));

describe("a genuine booking outage offers to retry the same slot", () => {
  it("offers Reintentar or Salir, and Reintentar books the same slot again after a processing message", () => {
    expect(startBooking({ ...booking(), state: SessionState.CITA_AWAITING_HORA_SELECT }, "07:30").session.slots).toMatchObject({
      [SlotKey.CITA_HORA_RESERVA]: "07:30",
    });
    const offered = outage();
    expect(offered.session.state).toBe(SessionState.CITA_AWAITING_BOOKING_RETRY);
    expect(sent(offered)).toEqual([OUTAGE_PROMPT]);
    expect(offered.notes).toEqual([
      { kind: "booking_retry", level: "warn", detail: { status: "unavailable", reason: "service_unavailable", retries: 0 } },
    ]);

    for (const answer of [tap(BookingRetryButtonId.RETRY), text("reintentar"), text("sí")]) {
      const retrying = handle(offered.session, answer);
      expect(retrying.session.state).toBe(SessionState.CITA_BOOKING_PENDING);
      expect(retrying.session.counters[CounterKey.CITA_BOOKING_RETRIES]).toBe(1);
      expect(texts(retrying)).toEqual(["Estamos procesando tu cita, un momento…"]);
      expect(queries(retrying)).toEqual([
        {
          kind: "book_appointment",
          payload: {
            codigoRenipress: "0000123",
            codigoUps: "E1",
            fechaCita: "31/12/2099",
            horaInicio: "09:00",
            numeroDocumentoPaciente: "12345678",
            retryAttempt: 1,
          },
        },
      ]);
    }
  });

  it("after the third failed retry it closes with a final text and no retry button", () => {
    const result = outage(booking({ [CounterKey.CITA_BOOKING_RETRIES]: 3 }));

    expect(result.session.state).toBe(SessionState.CITA_BOOKING_REJECTED);
    expect(sent(result)).toEqual([{ kind: "send_text", text: "No pudimos agendar tu cita en este momento. Inténtalo más tarde." }]);
    expect(result.notes?.[0]).toMatchObject({ kind: "booking_rejected", detail: { reason: "retries_exhausted", retries: 3 } });
  });

  it("Salir closes, anything else asks again, and a retry answered with 9000 offers another date", () => {
    const asking = outage().session;

    for (const answer of [tap(BookingRetryButtonId.EXIT), text("salir"), text("no")]) {
      expect(handle(asking, answer).session.state).toBe(SessionState.CITA_ABANDONED);
    }
    const unknown = handle(asking, text("qué pasó"));
    expect(unknown.session.state).toBe(SessionState.CITA_AWAITING_BOOKING_RETRY);
    expect(sent(unknown)).toEqual([OUTAGE_PROMPT]);
    expect(findButtonReprompt(asking.state)?.(asking)).toMatchObject({ effects: [OUTAGE_PROMPT] });

    const retried = handle(asking, tap(BookingRetryButtonId.RETRY)).session;
    const alreadyBooked = handle(retried, queryResult("book_appointment", { status: "already_has_appointment", message: "9000 | ..." }));
    expect(alreadyBooked.session.state).toBe(SessionState.CITA_AWAITING_ALREADY_BOOKED_CHOICE);
  });
});
