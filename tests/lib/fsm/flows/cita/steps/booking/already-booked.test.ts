import { describe, expect, it } from "vitest";
import { handle } from "@/lib/fsm/core/handlers";
import { findButtonReprompt } from "@/lib/fsm/flows/shared/button-reprompts";
import type { Session } from "@/lib/fsm/core/types";
import { AlreadyBookedButtonId } from "@/lib/enums/already-booked-button-id";
import { DuplicateButtonId } from "@/lib/enums/duplicate-button-id";
import { CounterKey } from "@/lib/enums/counter-key";
import { SessionState } from "@/lib/enums/session-state";
import { SlotKey } from "@/lib/enums/slot-key";
import { queries, queryResult, sent, tap, text } from "@/tests/support/fsm-events";

const MINSA_9000 = "Error al generar la cita en el servicio externo: 9000 | El paciente tiene una cita por atender en este servicio";

function booking(counters: Session["counters"] = {}): Session {
  return {
    state: SessionState.CITA_BOOKING_PENDING,
    slots: {
      [SlotKey.CITA_BEARER]: "token",
      [SlotKey.CITA_DNI]: "12345678",
      [SlotKey.CITA_UBIGEO]: "150132",
      [SlotKey.CITA_ESPECIALIDAD_ID]: "E1",
      [SlotKey.CITA_ESPECIALIDAD_NOMBRE]: "Pediatría",
      [SlotKey.CITA_COD_EESS]: "0000123",
      [SlotKey.CITA_FECHA]: "31/12/2099",
    },
    counters,
  };
}

const rejected = (session: Session = booking()) =>
  handle(session, queryResult("book_appointment", { status: "already_has_appointment", message: MINSA_9000 }));

describe("MINSA 9000: the citizen already has a cita that day", () => {
  it("offers another date or ending, and «Otra fecha» lists the dates of the same establecimiento and especialidad", () => {
    const result = rejected();

    expect(result.session.state).toBe(SessionState.CITA_AWAITING_ALREADY_BOOKED_CHOICE);
    expect(sent(result)).toEqual([
      {
        kind: "send_buttons",
        text: "Ese día ya cuentas con una cita agendada. ¿Deseas seleccionar otra fecha o terminar?",
        buttons: [
          { id: AlreadyBookedButtonId.OTHER_FECHA, title: "Otra fecha" },
          { id: AlreadyBookedButtonId.EXIT, title: "Terminar" },
        ],
      },
    ]);
    expect(result.notes).toEqual([
      {
        kind: "booking_rejected",
        level: "warn",
        detail: { status: "already_has_appointment", reason: "already_has_appointment", repeated: false },
      },
    ]);
    expect(findButtonReprompt(result.session.state)?.(result.session)).toMatchObject({ effects: sent(result) });

    for (const answer of [tap(AlreadyBookedButtonId.OTHER_FECHA), text("otra fecha"), text("sí")]) {
      const fechas = handle(result.session, answer);
      expect(fechas.session.state).toBe(SessionState.CITA_FECHA_PENDING);
      expect(queries(fechas)).toEqual([{ kind: "list_fechas", payload: { codEess: "0000123", especialidadId: "E1" } }]);
      expect(fechas.session.slots[SlotKey.CITA_FECHA]).toBeUndefined();
      expect(fechas.session.slots[SlotKey.CITA_FECHAS_DESCARTADAS]).toBe("31/12/2099");
      expect(fechas.session.slots[SlotKey.CITA_DNI]).toBe("12345678");
    }
  });

  it("«Terminar» closes like an abandoned cita and anything else asks again", () => {
    const asking = rejected().session;

    for (const answer of [tap(AlreadyBookedButtonId.EXIT), text("terminar"), text("no")]) {
      expect(handle(asking, answer).session.state).toBe(SessionState.CITA_ABANDONED);
    }
    const unknown = handle(asking, text("quizás mañana"));
    expect(unknown.session.state).toBe(SessionState.CITA_AWAITING_ALREADY_BOOKED_CHOICE);
    expect(sent(unknown)).toEqual(sent(rejected()));
  });

  it("a second 9000 in the same attempt offers another especialidad instead of looping over dates", () => {
    const result = rejected(booking({ [CounterKey.CITA_ALREADY_BOOKED_REJECTIONS]: 1 }));

    expect(result.session.state).toBe(SessionState.CITA_AWAITING_DUPLICATE_CHOICE);
    expect(sent(result)).toEqual([
      {
        kind: "send_buttons",
        text: "Ya tienes una cita pendiente en esta especialidad. Puedes elegir otra especialidad o terminar.",
        buttons: [
          { id: DuplicateButtonId.OTHER_ESPECIALIDAD, title: "Otra especialidad" },
          { id: DuplicateButtonId.EXIT, title: "Terminar" },
        ],
      },
    ]);
    expect(result.notes?.[0]?.detail).toMatchObject({ reason: "already_has_appointment", repeated: true });
    expect(result.session.counters[CounterKey.CITA_ALREADY_BOOKED_REJECTIONS]).toBeUndefined();
    expect(queries(handle(result.session, tap(DuplicateButtonId.OTHER_ESPECIALIDAD)))[0]).toMatchObject({ kind: "list_especialidades" });
    expect(handle(result.session, text("terminar")).session.state).toBe(SessionState.CITA_BOOKING_DUPLICATE);
  });
});
