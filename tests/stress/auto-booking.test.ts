import { describe, expect, it } from "vitest";
import { handle } from "@/lib/fsm/core/handlers";
import { isQueryEffect } from "@/lib/fsm/core/handlers-shared";
import type { HandlerResult, QueryResultEvent, Session } from "@/lib/fsm/core/types";

// Booking is the one step that cannot be quietly undone, so a lone horario is
// never booked on its own: typed times are confirmed, a list tap is an explicit
// choice, and an auto-selected single option goes to the confirmation step too
// ("Solo hay un horario disponible: … ¿Lo confirmas?"). Closes gap G1 of
// docs/technical-gaps.md. The step's own behavior (typed yes, "esa hora", "no")
// is covered in lib/fsm/flows/cita/single-horario.test.ts.

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

describe("a single horario is never booked without asking", () => {
  it("a day with ONE horario goes to the confirmation step", () => {
    const result = handle(horaPending("cita_hora_pending"), horasResult([{ horaInicio: "13:00", horaFin: "13:30" }]));

    expect(booksDirectly(result)).toBe(false);
    expect(result.session.state).toBe("cita_awaiting_hora_confirm");
    expect(result.session.slots.citaHoraConfirmId).toBe("13:00|13:30");
  });

  it("a last page with ONE leftover horario asks too, when the citizen only asked for 'Ver más horarios'", () => {
    const eleven = Array.from({ length: 11 }, (_, index) => {
      const start = `${String(7 + index).padStart(2, "0")}:00`;
      return { horaInicio: start, horaFin: `${start.slice(0, 2)}:30` };
    });

    // Page index 1 holds only the 11th slot.
    const result = handle(horaPending("cita_hora_page_pending", { citaHoraPage: 1 }), horasResult(eleven));

    expect(booksDirectly(result)).toBe(false);
    expect(result.session.state).toBe("cita_awaiting_hora_confirm");
  });
});
