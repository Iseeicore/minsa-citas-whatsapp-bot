import { describe, expect, it } from "vitest";
import { handle } from "@/lib/fsm/handlers";
import { isQueryEffect } from "@/lib/fsm/handlers-shared";
import type { HandlerResult, QueryResultEvent, Session } from "@/lib/fsm/types";
import { gap } from "../support/known-gap";

// TECHNICAL GAP (follow-up ticket): booking is the one step that cannot be
// quietly undone, yet when the catalog offers a SINGLE horario the bot books it
// without any confirmation screen. Typed times are always confirmed and a list
// tap is an explicit choice, but an auto-selected single option is neither.
//
// Kept as executable documentation. The wanted behavior: a lone horario goes to
// the confirmation step ("¿Confirmas el horario …?"), never straight to
// book_appointment. Current behavior is deliberately left unchanged in this
// branch; see docs/technical-gaps.md.

const FROM = "sandbox-auto-booking";

const horasResult = (items: Array<{ horaInicio: string; horaFin: string }>): QueryResultEvent => ({
  from: FROM,
  type: "query_result",
  queryKind: "list_horas",
  result: { status: "found", items: items.map((item) => ({ ...item, cantidadCupos: 1 })) },
});

function horaPending(state: string, extra: Session["counters"] = {}): Session {
  return {
    state,
    slots: {
      citaBearer: "token",
      citaCodEess: "0000123",
      citaEspecialidadId: "02",
      citaFecha: "31/12/2099", // a future day, so "already started" slots are not filtered out
      citaDni: "12345678",
    },
    counters: extra,
  };
}

const queries = (result: HandlerResult) => result.effects.filter(isQueryEffect);
const booksDirectly = (result: HandlerResult) => queries(result).some((query) => query.kind === "book_appointment");

describe("auto-booking of a single horario (documented gap)", () => {
  it("evidence: a day with ONE horario is booked without asking", () => {
    const result = handle(horaPending("cita_hora_pending"), horasResult([{ horaInicio: "13:00", horaFin: "13:30" }]));

    expect(booksDirectly(result)).toBe(true);
    expect(result.session.state).toBe("cita_booking_pending");
  });

  it("evidence: a last page with ONE leftover horario is booked when the citizen only asked for 'Ver más horarios'", () => {
    const eleven = Array.from({ length: 11 }, (_, index) => {
      const start = `${String(7 + index).padStart(2, "0")}:00`;
      return { horaInicio: start, horaFin: `${start.slice(0, 2)}:30` };
    });

    // Page index 1 holds only the 11th slot.
    const result = handle(horaPending("cita_hora_page_pending", { citaHoraPage: 1 }), horasResult(eleven));

    expect(booksDirectly(result)).toBe(true);
    expect(result.session.state).toBe("cita_booking_pending");
  });

  gap("a lone horario goes to the confirmation step instead of booking", () => {
    const result = handle(horaPending("cita_hora_pending"), horasResult([{ horaInicio: "13:00", horaFin: "13:30" }]));

    expect(booksDirectly(result)).toBe(false);
    expect(result.session.state).toBe("cita_awaiting_hora_confirm");
    expect(result.session.slots.citaHoraConfirmId).toBe("13:00|13:30");
  });

  gap("a one-slot last page also asks for confirmation", () => {
    const eleven = Array.from({ length: 11 }, (_, index) => {
      const start = `${String(7 + index).padStart(2, "0")}:00`;
      return { horaInicio: start, horaFin: `${start.slice(0, 2)}:30` };
    });

    const result = handle(horaPending("cita_hora_page_pending", { citaHoraPage: 1 }), horasResult(eleven));

    expect(booksDirectly(result)).toBe(false);
    expect(result.session.state).toBe("cita_awaiting_hora_confirm");
  });
});
