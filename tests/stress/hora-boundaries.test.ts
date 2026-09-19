import { describe, expect, it } from "vitest";
import { handle } from "@/lib/fsm/handlers";
import { isQueryEffect } from "@/lib/fsm/handlers-shared";
import { serializeOffered, type OfferedList } from "@/lib/fsm/selection-matchers";
import { packHoraSlots, type HoraSlot } from "@/lib/fsm/time-parser";
import type { HandlerResult, SendEffect, Session } from "@/lib/fsm/types";

const FROM = "sandbox-hora";

const slot = (start: string, end: string): HoraSlot => ({ start, end, cupos: 1 });

function horaSession(day: HoraSlot[], visible: HoraSlot[] = day.slice(0, 10)): Session {
  const offered: OfferedList = {
    text: "Selecciona el horario:",
    rows: visible.map((s) => ({
      id: `${s.start}|${s.end}`,
      title: `${s.start} - ${s.end}`,
      description: `${s.cupos} cupo(s) disponibles`,
    })),
  };

  return {
    state: "cita_awaiting_hora_select",
    slots: {
      citaBearer: "token",
      citaCodEess: "0000123",
      citaEspecialidadId: "02",
      citaFecha: "22/09/2026",
      citaDni: "12345678",
      citaOffered: serializeOffered(offered),
      citaHorasDia: packHoraSlots(day),
    },
    counters: {},
  };
}

const say = (session: Session, value: string): HandlerResult =>
  handle(session, { from: FROM, type: "text", text: value });

const sent = (r: HandlerResult) => r.effects.filter((e): e is SendEffect => !isQueryEffect(e));
const queries = (r: HandlerResult) => r.effects.filter(isQueryEffect);
const confirmId = (r: HandlerResult) =>
  r.session.state === "cita_awaiting_hora_confirm" ? r.session.slots.citaHoraConfirmId : undefined;
const listIds = (r: HandlerResult) => {
  const list = sent(r).find((e) => e.kind === "send_interactive_list");
  return list?.kind === "send_interactive_list" ? list.rows.map((row) => row.id) : undefined;
};

// ---------------------------------------------------------------------------
// C.1 The list from the brief:  1. 07:00   2. 08:00   3. 13:00
// ---------------------------------------------------------------------------
describe("C.1 bare numbers against the list [07:00, 08:00, 13:00]", () => {
  const session = () => horaSession([slot("07:00", "07:30"), slot("08:00", "08:30"), slot("13:00", "13:30")]);

  // "1" is genuinely ambiguous: list position 1 = 07:00, or 1 PM = 13:00. The
  // citizen gets a two-button question naming both, and nothing is booked.
  it("'1' offers the choice between position 1 (07:00) and 1 PM (13:00)", () => {
    const result = say(session(), "1");

    expect(queries(result)).toHaveLength(0);
    expect(result.session.state).toBe("cita_awaiting_hora_choice");

    const question = sent(result).find((e) => e.kind === "send_buttons") as
      | { text: string; buttons: Array<{ id: string; title: string }> }
      | undefined;
    expect(question?.text).toContain("07:00");
    expect(question?.text).toContain("13:00");
    expect(question?.buttons).toEqual([
      { id: "hora_choice_a", title: "Opción 1: 07:00" },
      { id: "hora_choice_b", title: "1:00 PM: 13:00" },
    ]);
  });

  it("'3' resolves to 13:00 by position with no disambiguation (3 AM/PM are not offered)", () => {
    const result = say(session(), "3");

    expect(result.session.state).toBe("cita_awaiting_hora_confirm");
    expect(confirmId(result)).toBe("13:00|13:30");
  });

  // There is no option 8, so "8" can only mean the hour: it resolves to 08:00
  // and asks for confirmation.
  it("'8' (no option 8) falls back to the hour and resolves to 08:00", () => {
    const result = say(session(), "8");

    expect(queries(result)).toHaveLength(0);
    expect(result.session.state).toBe("cita_awaiting_hora_confirm");
    expect(confirmId(result)).toBe("08:00|08:30");
  });

  it("'2' is only a position (2 AM/PM are not offered): confirm position 2", () => {
    expect(confirmId(say(session(), "2"))).toBe("08:00|08:30");
  });

  it("a bare number matching neither a position nor an hour is rejected and the list re-shown", () => {
    const result = say(session(), "5");

    expect(queries(result)).toHaveLength(0);
    expect(result.session.state).toBe("cita_awaiting_hora_select");
  });

  it("'en la tarde' keeps only slots >= 12:00", () => {
    const result = say(session(), "en la tarde");

    expect(confirmId(result)).toBe("13:00|13:30"); // the only afternoon slot
  });

  it("'en la mañana' keeps only slots < 12:00 (a list, since two match)", () => {
    const result = say(session(), "en la mañana");

    expect(result.session.state).toBe("cita_awaiting_hora_select");
    expect(listIds(result)).toEqual(["07:00|07:30", "08:00|08:30"]);
  });

  it.each(["11", "12", "13", "14", "20", "23"])("'%s' >= 11 can only be an hour, never a list position", (value) => {
    const result = say(session(), value);
    expect(queries(result)).toHaveLength(0);
    // 13 is offered; the others are not: none may be treated as a position.
    if (value === "13") expect(confirmId(result)).toBe("13:00|13:30");
    else expect(result.session.state).toBe("cita_awaiting_hora_select");
  });
});

// ---------------------------------------------------------------------------
// C.2 Non-standard formats
// ---------------------------------------------------------------------------
describe("C.2 formats on a fuller day", () => {
  const day = [
    slot("07:00", "07:30"),
    slot("08:00", "08:30"),
    slot("12:00", "12:30"),
    slot("13:00", "13:30"),
    slot("13:30", "14:00"),
    slot("14:15", "14:45"),
  ];
  const session = () => horaSession(day);

  it.each([
    ["a las 13 y media", "13:30|14:00"],
    ["13:30", "13:30|14:00"],
    ["1:30 pm", "13:30|14:00"],
    ["mediodía", "12:00|12:30"],
    ["12 pm", "12:00|12:30"],
    ["pasadas las 2", "14:15|14:45"],
    ["ocho y cuarto", undefined], // 08:15 not offered
    ["dos y cuarto de la tarde", "14:15|14:45"],
  ])("%s => %s", (value, expected) => {
    const result = say(session(), value);

    expect(queries(result)).toHaveLength(0);
    if (expected) expect(confirmId(result)).toBe(expected);
    else expect(result.session.state).toBe("cita_awaiting_hora_select");
  });

  it("'1 pm' lists every slot in the 13:00 hour", () => {
    const result = say(session(), "1 pm");

    expect(result.session.state).toBe("cita_awaiting_hora_select");
    expect(listIds(result)).toEqual(["13:00|13:30", "13:30|14:00"]);
  });

  it.each(["12 am", "12:30 am", "00:00", "24", "25", "0", "9 y 60", "-1", "1.5", "a las 25"])(
    "the boundary input %j never books and never invents a slot",
    (value) => {
      const result = say(session(), value);

      expect(queries(result)).toHaveLength(0);
      expect(["cita_awaiting_hora_select", "cita_awaiting_hora_confirm"]).toContain(result.session.state);
      if (result.session.state === "cita_awaiting_hora_confirm") {
        const offered = day.map((s) => `${s.start}|${s.end}`);
        expect(offered).toContain(String(confirmId(result)));
      }
    },
  );

  it("the value that reaches MINSA is the offered 24h slot, never the typed text", () => {
    const asked = say(session(), "1:30 pm");
    const confirmed = handle(asked.session, { from: FROM, type: "button", listId: "hora_confirm_si" });

    const [booking] = queries(confirmed);
    expect(booking.kind).toBe("book_appointment");
    expect(booking.payload.horaInicio).toBe("13:30");
  });
});
