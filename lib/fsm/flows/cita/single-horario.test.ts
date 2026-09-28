import { describe, expect, it } from "vitest";
import { isSlotAcceptance } from "@/lib/fsm/parsing/confirmation-parser";
import { handle } from "@/lib/fsm/core/handlers";
import { isQueryEffect } from "@/lib/fsm/core/handlers-shared";
import { serializeOffered, type OfferedRow } from "@/lib/fsm/parsing/selection-matchers";
import type { HandlerResult, InboundEvent, QueryResultEvent, SendEffect, Session } from "@/lib/fsm/core/types";

const FROM = "sandbox-single-horario";
const text = (value: string): InboundEvent => ({ from: FROM, type: "text", text: value });
const tap = (id: string): InboundEvent => ({ from: FROM, type: "button", listId: id });
const horasResult = (items: Array<{ horaInicio: string; horaFin: string }>): QueryResultEvent => ({
  from: FROM,
  type: "query_result",
  queryKind: "list_horas",
  result: { status: "found", items: items.map((item) => ({ ...item, cantidadCupos: 1 })) },
});

const queries = (result: HandlerResult) => result.effects.filter(isQueryEffect);
const sent = (result: HandlerResult): SendEffect[] =>
  result.effects.filter((effect): effect is SendEffect => !isQueryEffect(effect));

const BASE_SLOTS = {
  citaBearer: "token",
  citaCodEess: "0000123",
  citaEspecialidadId: "02",
  citaFecha: "31/12/2099",
  citaDni: "12345678",
};

const LONE = [{ horaInicio: "13:00", horaFin: "13:30" }];

function confirmingLone(extra: Session["slots"] = {}, counters: Session["counters"] = {}): Session {
  return {
    state: "cita_awaiting_hora_confirm",
    slots: { ...BASE_SLOTS, citaHoraConfirmId: "13:00|13:30", citaHoraConfirmOnly: "1", ...extra },
    counters,
  };
}

const PREVIOUS_PAGE: OfferedRow[] = Array.from({ length: 10 }, (_, index) => {
  const start = `${String(7 + index).padStart(2, "0")}:00`;
  return { id: `${start}|${start.slice(0, 2)}:30`, title: `${start} - ${start.slice(0, 2)}:30` };
});
const previousPageList = () => serializeOffered({ text: "Selecciona el horario:", rows: PREVIOUS_PAGE });

const isBooking = (result: HandlerResult) =>
  queries(result).length === 1 && queries(result)[0].kind === "book_appointment";

describe("a day with ONE horario asks before booking", () => {
  const asked = () =>
    handle({ state: "cita_hora_pending", slots: { ...BASE_SLOTS }, counters: {} }, horasResult(LONE));

  it("goes to the confirmation step, never straight to book_appointment", () => {
    const result = asked();

    expect(result.session.state).toBe("cita_awaiting_hora_confirm");
    expect(queries(result)).toHaveLength(0);
    expect(result.session.slots.citaHoraConfirmId).toBe("13:00|13:30");
    expect(result.session.slots.citaHoraConfirmOnly).toBe("1");
  });

  it("says it is the only one and asks with the two buttons", () => {
    const [message] = sent(asked());

    expect(message).toMatchObject({
      kind: "send_buttons",
      text: "Solo hay un horario disponible: 1:00 - 1:30 PM. ¿Lo confirmas?",
    });
    expect((message as { buttons: Array<{ id: string }> }).buttons.map((button) => button.id)).toEqual([
      "hora_confirm_si",
      "hora_confirm_no",
    ]);
  });

  it("a one-slot last page asks too, when the citizen only asked for 'Ver más horarios'", () => {
    const eleven = Array.from({ length: 11 }, (_, index) => {
      const start = `${String(7 + index).padStart(2, "0")}:00`;
      return { horaInicio: start, horaFin: `${start.slice(0, 2)}:30` };
    });

    const result = handle(
      { state: "cita_hora_page_pending", slots: { ...BASE_SLOTS, citaOffered: previousPageList() }, counters: { citaHoraPage: 1 } },
      horasResult(eleven),
    );

    expect(queries(result)).toHaveLength(0);
    expect(result.session.state).toBe("cita_awaiting_hora_confirm");
    expect(result.session.slots.citaHoraConfirmId).toBe("17:00|17:30");
  });

  it("more than one horario still shows the list, and no 'only one' flag is left behind", () => {
    const result = handle(
      { state: "cita_hora_pending", slots: { ...BASE_SLOTS }, counters: {} },
      horasResult([...LONE, { horaInicio: "14:00", horaFin: "14:30" }]),
    );

    expect(result.session.state).toBe("cita_awaiting_hora_select");
    expect(result.session.slots.citaHoraConfirmOnly).toBeUndefined();
  });

  it("a booking retry that leaves one horario also asks instead of booking again", () => {
    const rejected = handle(
      { state: "cita_booking_pending", slots: { ...BASE_SLOTS }, counters: {} },
      { from: FROM, type: "query_result", queryKind: "book_appointment", result: { status: "error" } },
    );
    expect(rejected.session.state).toBe("cita_hora_pending");

    const again = handle(rejected.session, horasResult(LONE));
    expect(again.session.state).toBe("cita_awaiting_hora_confirm");
    expect(queries(again)).toHaveLength(0);
  });
});

describe("yes: the button or any way of taking that hour", () => {
  const BOOKING = {
    kind: "book_appointment",
    payload: {
      codigoRenipress: "0000123",
      codigoUps: "02",
      fechaCita: "31/12/2099",
      horaInicio: "13:00",
      numeroDocumentoPaciente: "12345678",
    },
  };

  it("books on the button and leaves no confirmation slot behind", () => {
    const result = handle(confirmingLone(), tap("hora_confirm_si"));

    expect(result.session.state).toBe("cita_booking_pending");
    expect(queries(result)).toEqual([BOOKING]);
    expect(result.session.slots.citaHoraConfirmId).toBeUndefined();
    expect(result.session.slots.citaHoraConfirmOnly).toBeUndefined();
  });

  it.each([
    "si",
    "Si por favor",
    "dale",
    "ok",
    "esa hora",
    "esa misma",
    "esa misma hora",
    "me sirve",
    "me conviene",
    "sí, esa hora",
    "esa me sirve",
    "la tomo",
    "quiero esa hora",
    "13:00",
    "a la 1",
    "a la 1 pm",
    "1:00 pm",
    "a las 13:00",
  ])("%j books that hora", (typed) => {
    const result = handle(confirmingLone(), text(typed));

    expect(queries(result), typed).toEqual([BOOKING]);
    expect(result.session.state).toBe("cita_booking_pending");
  });

  it.each(["13:30", "a las 3", "a las 8 am", "mañana a las 10", "no a la 1", "no esa hora", "si pero a las 3", "quizás"])(
    "%j does NOT book: it asks again",
    (typed) => {
      const result = handle(confirmingLone(), text(typed));

      expect(queries(result), typed).toHaveLength(0);
      expect(result.session.state).toBe("cita_awaiting_hora_confirm");
      expect(result.session.slots.citaHoraConfirmId).toBe("13:00|13:30");
      expect(sent(result)[0]).toMatchObject({
        kind: "send_buttons",
        text: "Solo hay un horario disponible: 1:00 - 1:30 PM. ¿Lo confirmas?",
      });
    },
  );

  it("a photo or a sticker asks again, it never books", () => {
    const result = handle(confirmingLone(), { from: FROM, type: "image", mediaId: "m1" });

    expect(queries(result)).toHaveLength(0);
    expect(result.session.state).toBe("cita_awaiting_hora_confirm");
  });
});

describe("no, with nothing to go back to: another date is offered (see other-fecha.test.ts)", () => {
  it.each([["the button", tap("hora_confirm_no")], ["typed no", text("no")], ["typed «otro horario»", text("otro horario")]])(
    "%s does not book and does not close: it asks about another date",
    (_label, event) => {
      const result = handle(confirmingLone(), event);

      expect(queries(result)).toHaveLength(0);
      expect(result.session.state).toBe("cita_awaiting_other_fecha");
      expect(result.session.slots.citaHoraConfirmId).toBeUndefined();
      expect(result.session.slots.citaHoraConfirmOnly).toBeUndefined();
    },
  );
});

describe("no, with the previous page's list still there: back to that list", () => {
  it("shows the list again and steps the page back, so 'Ver más horarios' is not empty", () => {
    const session = confirmingLone({ citaOffered: previousPageList() }, { citaHoraPage: 1 });

    const result = handle(session, tap("hora_confirm_no"));

    expect(result.session.state).toBe("cita_awaiting_hora_select");
    expect(sent(result).map((effect) => effect.kind)).toEqual(["send_text", "send_interactive_list"]);
    expect(result.session.counters.citaHoraPage).toBe(0);
    expect(result.session.slots.citaHoraConfirmId).toBeUndefined();
    expect(result.session.slots.citaHoraConfirmOnly).toBeUndefined();
  });

  it("two pages back: the page counter goes from 2 to 1", () => {
    const session = confirmingLone({ citaOffered: previousPageList() }, { citaHoraPage: 2 });

    expect(handle(session, text("no")).session.counters.citaHoraPage).toBe(1);
  });
});

describe("a confirmation the citizen picked from a list keeps its old behavior", () => {
  it("«No, ver horarios» still goes back to the list", () => {
    const session: Session = {
      state: "cita_awaiting_hora_confirm",
      slots: { ...BASE_SLOTS, citaHoraConfirmId: "08:00|08:30", citaOffered: previousPageList() },
      counters: {},
    };

    const result = handle(session, tap("hora_confirm_no"));

    expect(result.session.state).toBe("cita_awaiting_hora_select");
    expect(sent(result)[0]).toMatchObject({ text: "Sin problema. Elige otro horario:" });
  });

  it("asks with the usual sentence, not the «only one» one", () => {
    const session: Session = {
      state: "cita_awaiting_hora_confirm",
      slots: { ...BASE_SLOTS, citaHoraConfirmId: "08:00|08:30", citaOffered: previousPageList() },
      counters: {},
    };

    expect(sent(handle(session, text("no sé")))[0]).toMatchObject({ text: "¿Confirmas el horario 8:00 - 8:30 AM?" });
  });

  it("the pending hour typed back, or «esa hora», also confirms here; another hour does not", () => {
    const session: Session = {
      state: "cita_awaiting_hora_confirm",
      slots: { ...BASE_SLOTS, citaHoraConfirmId: "08:00|08:30", citaOffered: previousPageList() },
      counters: {},
    };

    expect(isBooking(handle(session, text("a las 8")))).toBe(true);
    expect(isBooking(handle(session, text("esa hora")))).toBe(true);
    expect(isBooking(handle(session, text("a las 9")))).toBe(false);
  });
});

describe("isSlotAcceptance: taking THAT hour, said in words", () => {
  it.each([
    "esa hora",
    "esa",
    "ese horario",
    "esa misma",
    "esa misma hora",
    "me sirve",
    "esa me sirve",
    "me conviene",
    "la tomo",
    "lo tomo",
    "la quiero",
    "quiero esa",
    "quiero esa hora",
    "si esa hora",
    "sí, esa hora por favor",
    "ok esa",
    "ESA HORA!",
  ])("%j is", (typed) => {
    expect(isSlotAcceptance(typed)).toBe(true);
  });

  it.each(["", "hola", "no", "no me sirve", "esa no", "otra hora", "esa hora no", "a las 3", "me sirve otra", "quiero cambiar"])(
    "%j is not",
    (typed) => {
      expect(isSlotAcceptance(typed)).toBe(false);
    },
  );
});
