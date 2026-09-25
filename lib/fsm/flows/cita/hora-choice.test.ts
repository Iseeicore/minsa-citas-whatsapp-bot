import { describe, expect, it } from "vitest";
import { handle } from "@/lib/fsm/core/handlers";
import { isQueryEffect } from "@/lib/fsm/core/handlers-shared";
import { serializeOffered, type OfferedList } from "@/lib/fsm/parsing/selection-matchers";
import type { HandlerResult, InboundEvent, SendEffect, Session } from "@/lib/fsm/core/types";

const FROM = "sandbox-choice";

const text = (value: string): InboundEvent => ({ from: FROM, type: "text", text: value });
const button = (id: string): InboundEvent => ({ from: FROM, type: "button", listId: id });
const sent = (r: HandlerResult) => r.effects.filter((e): e is SendEffect => !isQueryEffect(e));
const queries = (r: HandlerResult) => r.effects.filter(isQueryEffect);
const listIds = (r: HandlerResult) => {
  const list = sent(r).find((e) => e.kind === "send_interactive_list");
  return list?.kind === "send_interactive_list" ? list.rows.map((row) => row.id) : undefined;
};

const row = (start: string, end: string) => ({ id: `${start}|${end}`, title: `${start} - ${end}`, description: "1 cupo(s) disponibles" });

function horaSession(visible: OfferedList["rows"], day: string): Session {
  return {
    state: "cita_awaiting_hora_select",
    slots: {
      citaBearer: "token",
      citaCodEess: "0000123",
      citaEspecialidadId: "02",
      citaFecha: "22/09/2026",
      citaDni: "12345678",
      citaOffered: serializeOffered({ text: "Selecciona el horario:", rows: visible }),
      citaHorasDia: day,
    },
    counters: {},
  };
}

const PAGE = [row("07:00", "07:30"), row("08:00", "08:30"), row("13:00", "13:30")];
const DAY = "07:00|07:30|1;08:00|08:30|1;13:00|13:30|1";

describe("hora select: a bare 1..10 that is both a list position and an hour", () => {
  it("asks which one was meant, with both interpretations spelled out", () => {
    const result = handle(horaSession(PAGE, DAY), text("1"));

    expect(result.session.state).toBe("cita_awaiting_hora_choice");
    expect(queries(result)).toHaveLength(0);
    expect(result.session.slots.citaHoraChoiceA).toBe("07:00|07:30");
    expect(sent(result)[0]).toMatchObject({
      kind: "send_buttons",
      buttons: [
        { id: "hora_choice_a", title: "Opción 1: 07:00" },
        { id: "hora_choice_b", title: "1:00 PM: 13:00" },
      ],
    });
  });

  it("'Opción 1' books the position's slot directly (the button names the exact time)", () => {
    const asked = handle(horaSession(PAGE, DAY), text("1"));

    const result = handle(asked.session, button("hora_choice_a"));

    expect(result.session.state).toBe("cita_booking_pending");
    expect(queries(result)[0]).toMatchObject({ kind: "book_appointment", payload: { horaInicio: "07:00" } });
    expect(result.session.slots.citaHoraChoiceA).toBeUndefined();
    expect(result.session.slots.citaHoraChoiceB).toBeUndefined();
  });

  it("'1:00 PM' books the 13:00 slot", () => {
    const asked = handle(horaSession(PAGE, DAY), text("1"));

    const result = handle(asked.session, button("hora_choice_b"));

    expect(queries(result)[0]).toMatchObject({ kind: "book_appointment", payload: { horaInicio: "13:00" } });
  });

  it("when the hour has several slots the second button lists them instead of picking one", () => {
    const crowded = `${DAY};13:15|13:45|1;13:45|14:15|1`;
    const asked = handle(horaSession(PAGE, crowded), text("1"));

    expect(sent(asked)[0]).toMatchObject({
      buttons: [
        { id: "hora_choice_a", title: "Opción 1: 07:00" },
        { id: "hora_choice_b", title: "1 PM: ver horas" },
      ],
    });

    const result = handle(asked.session, button("hora_choice_b"));

    expect(result.session.state).toBe("cita_awaiting_hora_select");
    expect(queries(result)).toHaveLength(0);
    expect(listIds(result)).toEqual(["13:00|13:30", "13:15|13:45", "13:45|14:15"]);
  });

  it("typing a time instead of tapping is read as a normal typed time", () => {
    const asked = handle(horaSession(PAGE, DAY), text("1"));

    const result = handle(asked.session, text("1 pm"));

    expect(result.session.state).toBe("cita_awaiting_hora_confirm");
    expect(result.session.slots.citaHoraConfirmId).toBe("13:00|13:30");
    expect(result.session.slots.citaHoraChoiceA).toBeUndefined();
  });

  it("an unknown button just asks again and never books", () => {
    const asked = handle(horaSession(PAGE, DAY), text("1"));

    const result = handle(asked.session, button("something_else"));

    expect(result.session.state).toBe("cita_awaiting_hora_choice");
    expect(queries(result)).toHaveLength(0);
    expect(sent(result)[0]).toMatchObject({ kind: "send_buttons" });
  });

  it("abusive text while the question is open gets the respect reminder and the list, not a booking", () => {
    const asked = handle(horaSession(PAGE, DAY), text("1"));

    const result = handle(asked.session, text("hdp"));

    expect(queries(result)).toHaveLength(0);
    expect((sent(result)[0] as { text: string }).text).toContain("política de respeto");
  });

  it("no collision means no question: a position that is also the only matching hour is just confirmed", () => {
    const rows = Array.from({ length: 8 }, (_, index) => row(`${String(index + 1).padStart(2, "0")}:00`, `${String(index + 1).padStart(2, "0")}:30`));
    const day = rows.map((r) => `${r.id}|1`).join(";");

    const result = handle(horaSession(rows, day), text("8"));

    expect(result.session.state).toBe("cita_awaiting_hora_confirm");
    expect(result.session.slots.citaHoraConfirmId).toBe("08:00|08:30");
  });

  it("an out-of-range number with several slots in that hour lists them", () => {
    const day = `${DAY};08:45|09:15|1`;

    const result = handle(horaSession(PAGE, day), text("8"));

    expect(queries(result)).toHaveLength(0);
    expect(listIds(result)).toEqual(["08:00|08:30", "08:45|09:15"]);
  });

  it("11 and above are hours only, never positions or a question", () => {
    const result = handle(horaSession(PAGE, DAY), text("13"));

    expect(result.session.state).toBe("cita_awaiting_hora_confirm");
    expect(result.session.slots.citaHoraConfirmId).toBe("13:00|13:30");
  });

  it("an explicit position ('la 1', 'el primero') is never ambiguous", () => {
    for (const phrase of ["la 1", "el primero", "opción 1"]) {
      const result = handle(horaSession(PAGE, DAY), text(phrase));
      expect(result.session.state, phrase).toBe("cita_awaiting_hora_confirm");
      expect(result.session.slots.citaHoraConfirmId, phrase).toBe("07:00|07:30");
    }
  });
});
