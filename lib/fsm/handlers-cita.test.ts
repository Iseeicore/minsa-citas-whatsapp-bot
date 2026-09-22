import { afterEach, describe, expect, it, vi } from "vitest";
import { RESPECT_REMINDER_TEXT } from "../security/lexical-guard";
import { handle } from "./handlers";
import { isQueryEffect } from "./handlers-shared";
import {
  readOffered,
  serializeOffered,
  type OfferedList,
  type OfferedRow,
} from "./selection-matchers";
import type {
  HandlerResult,
  InboundEvent,
  QueryEffect,
  QueryEffectKind,
  QueryResultEvent,
  SendEffect,
  Session,
} from "./types";

const FROM = "sandbox-test";

const text = (value: string): InboundEvent => ({ from: FROM, type: "text", text: value });
const tap = (id: string): InboundEvent => ({ from: FROM, type: "list", listId: id });
const queryResult = (queryKind: QueryEffectKind, result: unknown): QueryResultEvent => ({
  from: FROM,
  type: "query_result",
  queryKind,
  result,
});

function at(state: string, offered?: OfferedList, slots: Session["slots"] = {}): Session {
  return {
    state,
    slots: {
      citaBearer: "token",
      ...slots,
      ...(offered ? { citaOffered: serializeOffered(offered) } : {}),
    },
    counters: {},
  };
}

const sent = (result: HandlerResult): SendEffect[] =>
  result.effects.filter((effect): effect is SendEffect => !isQueryEffect(effect));

const queries = (result: HandlerResult): QueryEffect[] => result.effects.filter(isQueryEffect);

const listRowsOf = (result: HandlerResult): OfferedRow[] | undefined => {
  const list = sent(result).find((effect) => effect.kind === "send_interactive_list");
  return list?.kind === "send_interactive_list" ? list.rows : undefined;
};

const ubigeo: OfferedList = {
  text: "Selecciona tu ubigeo:",
  rows: [
    { id: "150101", title: "San Juan de Lurigancho", description: "Lima — Lima" },
    { id: "150102", title: "San Juan de Miraflores", description: "Lima — Lima" },
    { id: "150701", title: "San Juan de Iris", description: "Huarochirí — Lima" },
    { id: "150702", title: "San Juan de Tantaranche", description: "Huarochirí — Lima" },
  ],
};

const especialidades: OfferedList = {
  text: "Selecciona la especialidad:",
  rows: [
    { id: "01", title: "MEDICINA GENERAL", description: "5 cupo(s) disponibles" },
    { id: "02", title: "ODONTOLOGIA", description: "3 cupo(s) disponibles" },
  ],
};

const establecimientos: OfferedList = {
  text: "Selecciona el establecimiento:",
  rows: [
    { id: "0000123", title: "CENTRO DE SALUD SAN BORJA", description: "10 cupo(s) en línea" },
    { id: "0000456", title: "HOSPITAL DE LURIGANCHO", description: "4 cupo(s) en línea" },
  ],
};

const fechas: OfferedList = {
  text: "Selecciona la fecha:",
  rows: [
    { id: "22/09/2026", title: "22/09/2026", description: "5 cupo(s) disponibles" },
    { id: "23/09/2026", title: "23/09/2026", description: "3 cupo(s) disponibles" },
  ],
};

const horas: OfferedList = {
  text: "Selecciona el horario:",
  rows: [
    { id: "08:00|08:30", title: "08:00 - 08:30", description: "2 cupo(s) disponibles" },
    { id: "08:45|09:15", title: "08:45 - 09:15", description: "1 cupo(s) disponibles" },
  ],
};

const REJECTION = "Selecciona una opción de la lista.";

function expectRejectedAndReshown(result: HandlerResult, state: string, offered: OfferedList) {
  expect(result.session.state).toBe(state);
  expect(queries(result)).toHaveLength(0);
  expect((sent(result)[0] as { text: string }).text).toBe(REJECTION);
  expect(listRowsOf(result)).toEqual(offered.rows);
}

describe("OTP verification — proactive district resolution from the opening message", () => {
  it("tries to resolve the district from initialMessageText when the deterministic hint failed but a place preposition was used", () => {
    const session = at("cita_verify_pending", undefined, {
      citaDniPending: "12345678",
      initialMessageText: "quiero cita de odontología en sam borja",
    });
    const result = handle(session, queryResult("verify_code", { status: "verified", token: "tok" }));

    // No blind "Cuéntanos en qué distrito" question: a place preposition was
    // there, so the opening message is tried through resolveDistritoText
    // (local search, then AI) before ever asking again.
    expect(queries(result).some((effect) => effect.kind === "resolve_distrito_ai")).toBe(true);
    expect(sent(result).some((effect) => "text" in effect && effect.text.includes("Cuéntanos en qué distrito"))).toBe(false);
  });

  it("still just asks plainly when the opening message never mentioned a place at all", () => {
    const session = at("cita_verify_pending", undefined, {
      citaDniPending: "12345678",
      initialMessageText: "quiero una cita de odontología",
    });
    const result = handle(session, queryResult("verify_code", { status: "verified", token: "tok" }));

    // No place preposition at all: don't spend an AI call, just ask.
    expect(queries(result)).toHaveLength(0);
    expect((sent(result)[0] as { text: string }).text).toContain("Cuéntanos en qué distrito");
  });

  it("still just asks plainly when there is no initialMessageText at all", () => {
    const session = at("cita_verify_pending", undefined, { citaDniPending: "12345678" });
    const result = handle(session, queryResult("verify_code", { status: "verified", token: "tok" }));

    expect(queries(result)).toHaveLength(0);
    expect((sent(result)[0] as { text: string }).text).toContain("Cuéntanos en qué distrito");
  });
});

describe("offered options are remembered when a list is sent", () => {
  it("ubigeo list", () => {
    const result = handle(
      at("cita_ubigeo_pending"),
      queryResult("search_ubigeo", {
        status: "found",
        items: [
          { ubigeoInei: "150101", distrito: "A", provincia: "P", departamento: "D" },
          { ubigeoInei: "150102", distrito: "B", provincia: "P", departamento: "D" },
        ],
      }),
    );

    expect(result.session.state).toBe("cita_awaiting_ubigeo_select");
    expect(readOffered(result.session.slots)?.rows.map((row) => row.id)).toEqual(["150101", "150102"]);
  });

  it("fecha list", () => {
    const result = handle(
      at("cita_fecha_pending"),
      queryResult("list_fechas", {
        status: "found",
        items: [
          { fechaCupo: "22/09/2026", cantidadCupos: 5 },
          { fechaCupo: "23/09/2026", cantidadCupos: 3 },
        ],
      }),
    );

    expect(readOffered(result.session.slots)?.rows.map((row) => row.id)).toEqual(["22/09/2026", "23/09/2026"]);
  });

  it("hora list", () => {
    const result = handle(
      at("cita_hora_pending", undefined, { citaFecha: "31/12/2099" }),
      queryResult("list_horas", {
        status: "found",
        items: [
          { horaInicio: "08:00", horaFin: "08:30", cantidadCupos: 2 },
          { horaInicio: "08:45", horaFin: "09:15", cantidadCupos: 1 },
        ],
      }),
    );

    expect(result.session.state).toBe("cita_awaiting_hora_select");
    expect(readOffered(result.session.slots)?.rows.map((row) => row.id)).toEqual(["08:00|08:30", "08:45|09:15"]);
  });
});

describe("ubigeo select (list MINSA returned for a resolved district)", () => {
  const state = "cita_awaiting_ubigeo_select";

  it("a tap on an offered row proceeds and clears the offered options", () => {
    const result = handle(at(state, ubigeo), tap("150101"));

    expect(result.session.state).toBe("cita_especialidad_pending");
    expect(result.session.slots.citaUbigeo).toBe("150101");
    expect(result.session.slots.citaOffered).toBeUndefined();
    expect(queries(result)[0]).toMatchObject({ kind: "list_especialidades", payload: { ubigeo: "150101" } });
  });

  it.each([
    ["el segundo", "150102"],
    ["lurigancho", "150101"],
    ["3", "150701"],
  ])("typed %s picks the offered row %s", (message, id) => {
    const result = handle(at(state, ubigeo), text(message));

    expect(result.session.state).toBe("cita_especialidad_pending");
    expect(queries(result)[0]).toMatchObject({ kind: "list_especialidades", payload: { ubigeo: id } });
  });

  it("unmatched text never reaches MINSA: rejects and re-shows the list", () => {
    expectRejectedAndReshown(handle(at(state, ubigeo), text("xyz")), state, ubigeo);
  });

  it("a stale tap on an id that was not offered is rejected", () => {
    expectRejectedAndReshown(handle(at(state, ubigeo), tap("999999")), state, ubigeo);
  });

  it("an ambiguous phrase narrows the list instead of guessing", () => {
    const result = handle(at(state, ubigeo), text("el de Huarochirí"));

    expect(result.session.state).toBe(state);
    expect(queries(result)).toHaveLength(0);
    expect(listRowsOf(result)?.map((row) => row.id)).toEqual(["150701", "150702"]);
    expect(readOffered(result.session.slots)?.rows.map((row) => row.id)).toEqual(["150701", "150702"]);
  });

  it("abusive text gets a respect reminder and the list again, without any query", () => {
    const result = handle(at(state, ubigeo), text("hdp"));

    expect(result.session.state).toBe(state);
    expect(queries(result)).toHaveLength(0);
    expect((sent(result)[0] as { text: string }).text).toBe(RESPECT_REMINDER_TEXT);
    expect(listRowsOf(result)).toEqual(ubigeo.rows);
  });

  it("sessions created before this change (no offered options) keep working for taps", () => {
    const legacy = at(state);
    expect(queries(handle(legacy, tap("150101")))[0]).toMatchObject({ kind: "list_especialidades" });

    const typed = handle(legacy, text("hola"));
    expect(queries(typed)).toHaveLength(0);
    expect((sent(typed)[0] as { text: string }).text).toBe(REJECTION);
  });
});

describe("district disambiguation (candidates from the dataset / AI chain)", () => {
  const state = "cita_awaiting_distrito_disambiguation";
  const candidates: OfferedList = {
    text: "Encontramos varias opciones. ¿Cuál es tu distrito?",
    rows: [
      { id: "Lima|Lima|San Juan de Lurigancho", title: "San Juan de Lurigancho", description: "Lima — Lima" },
      { id: "Lima|Huarochirí|San Juan de Iris", title: "San Juan de Iris", description: "Huarochirí — Lima" },
    ],
  };

  it("a typed ordinal picks the candidate and searches its ubigeo", () => {
    const result = handle(at(state, candidates), text("1"));

    expect(result.session.state).toBe("cita_ubigeo_pending");
    expect(queries(result)[0]).toMatchObject({
      kind: "search_ubigeo",
      payload: { departamento: "Lima", provincia: "Lima", distrito: "San Juan de Lurigancho" },
    });
  });

  it("filters by provincia when the citizen names it", () => {
    const result = handle(at(state, candidates), text("el de Huarochirí"));

    expect(queries(result)[0]).toMatchObject({
      kind: "search_ubigeo",
      payload: { provincia: "Huarochirí", distrito: "San Juan de Iris" },
    });
  });

  it("a hand-typed fake id is rejected without spending an AI call", () => {
    const result = handle(at(state, candidates), text("a|b|c"));

    expect(result.session.state).toBe(state);
    expect(queries(result)).toHaveLength(0);
    expect((sent(result)[0] as { text: string }).text).toBe(REJECTION);
  });

  it("a different district name re-runs the existing resolution chain", () => {
    const result = handle(at(state, candidates), text("Barranco"));

    expect(result.session.state).toBe("cita_ubigeo_pending");
    expect(queries(result)[0].kind).toBe("search_ubigeo");
    expect(String(queries(result)[0].payload.distrito).toUpperCase()).toBe("BARRANCO");
  });
});

describe("especialidad and establecimiento selects", () => {
  it("typed specialty name picks the offered specialty", () => {
    const result = handle(
      at("cita_awaiting_especialidad_select", especialidades, { citaUbigeo: "150101" }),
      text("odontología"),
    );

    expect(result.session.state).toBe("cita_establecimiento_pending");
    expect(result.session.slots.citaEspecialidadId).toBe("02");
    expect(queries(result)[0]).toMatchObject({
      kind: "list_establecimientos",
      payload: { especialidadId: "02", ubigeo: "150101" },
    });
  });

  it("unmatched specialty text is rejected and the list re-shown", () => {
    expectRejectedAndReshown(
      handle(at("cita_awaiting_especialidad_select", especialidades), text("asdf")),
      "cita_awaiting_especialidad_select",
      especialidades,
    );
  });

  it("typed establishment name picks the offered establishment", () => {
    const result = handle(
      at("cita_awaiting_establecimiento_select", establecimientos, { citaEspecialidadId: "02" }),
      text("el de San Borja"),
    );

    expect(result.session.state).toBe("cita_fecha_pending");
    expect(queries(result)[0]).toMatchObject({
      kind: "list_fechas",
      payload: { codEess: "0000123", especialidadId: "02" },
    });
  });
});

describe("fecha select", () => {
  const state = "cita_awaiting_fecha_select";

  it("a tap proceeds to the horarios query", () => {
    const result = handle(at(state, fechas, { citaCodEess: "0000123", citaEspecialidadId: "02" }), tap("22/09/2026"));

    expect(result.session.state).toBe("cita_hora_pending");
    expect(queries(result)[0]).toMatchObject({ kind: "list_horas", payload: { fecha: "22/09/2026" } });
  });

  it("typed ordinal or full date picks an offered date", () => {
    const base = at(state, fechas, { citaCodEess: "0000123", citaEspecialidadId: "02" });

    expect(queries(handle(base, text("2")))[0]).toMatchObject({ payload: { fecha: "23/09/2026" } });
    expect(queries(handle(base, text("22/09/2026")))[0]).toMatchObject({ payload: { fecha: "22/09/2026" } });
  });

  it("garbage is rejected and never sent to MINSA as a date", () => {
    expectRejectedAndReshown(handle(at(state, fechas), text("asdf")), state, fechas);
    expectRejectedAndReshown(handle(at(state, fechas), text("junk")), state, fechas);
  });
});

describe("hora pending — zero horarios for the picked date", () => {
  it("offers another date instead of a dead-end rejection", () => {
    const session = at("cita_hora_pending", undefined, {
      citaCodEess: "0000123",
      citaEspecialidadId: "02",
      citaFecha: "22/09/2026",
    });
    const result = handle(session, queryResult("list_horas", { status: "empty" }));

    // Not the old dead end (cita_booking_rejected, nothing else to do).
    expect(result.session.state).toBe("cita_awaiting_other_fecha");
    expect((sent(result)[0] as { text: string }).text).toContain("No hay horarios disponibles para esa fecha.");
    expect((sent(result)[0] as { text: string }).text).toContain("¿Deseas cambiar de fecha?");
    // The date that came back empty is remembered so it's never offered again.
    expect(result.session.slots.citaFechasDescartadas).toBe("22/09/2026");
  });

  it("an explicit empty items array behaves the same as status: empty", () => {
    const session = at("cita_hora_pending", undefined, {
      citaCodEess: "0000123",
      citaEspecialidadId: "02",
      citaFecha: "22/09/2026",
    });
    const result = handle(session, queryResult("list_horas", { status: "found", items: [] }));

    expect(result.session.state).toBe("cita_awaiting_other_fecha");
  });
});

describe("booking pending — raw HTTP errors are not the same as a real rejection", () => {
  const bookingState = () =>
    at("cita_booking_pending", undefined, {
      citaCodEess: "0000123",
      citaEspecialidadId: "02",
      citaFecha: "22/09/2026",
      citaDni: "12345678",
    });

  it("a raw HTTP error retries WITHOUT inventing a 'someone else took it' reason", () => {
    const result = handle(bookingState(), queryResult("book_appointment", { status: "error" }));

    expect(result.session.state).toBe("cita_hora_pending");
    expect(queries(result)[0]).toMatchObject({ kind: "list_horas" });
    const shown = (sent(result)[0] as { text: string }).text;
    expect(shown).toContain("problema técnico");
    expect(shown).not.toContain("otra persona");
  });

  it("a rejection with no message is still treated as an ambiguous 'may be taken' case", () => {
    const result = handle(bookingState(), queryResult("book_appointment", { status: "rejected" }));

    expect(result.session.state).toBe("cita_hora_pending");
    expect((sent(result)[0] as { text: string }).text).toContain("otra persona lo haya tomado");
  });

  it("a rejection whose message mentions the slot is treated the same way", () => {
    const result = handle(
      bookingState(),
      queryResult("book_appointment", { status: "rejected", message: "Ya no hay cupos para ese horario" }),
    );

    expect(result.session.state).toBe("cita_hora_pending");
    expect((sent(result)[0] as { text: string }).text).toContain("otra persona lo haya tomado");
  });

  it("a rejection with an unrelated business message closes the flow with THAT message, no retry", () => {
    const result = handle(
      bookingState(),
      queryResult("book_appointment", { status: "rejected", message: "El paciente no cumple los requisitos de la campaña." }),
    );

    expect(result.session.state).toBe("cita_booking_rejected");
    expect(queries(result)).toHaveLength(0);
    expect((sent(result)[0] as { text: string }).text).toBe("El paciente no cumple los requisitos de la campaña.");
  });

  it("the 3rd straight raw error closes the flow with the honest generic fallback, not a fabricated reason", () => {
    const session = { ...bookingState(), counters: { citaBookingFailures: 2 } };
    const result = handle(session, queryResult("book_appointment", { status: "error" }));

    expect(result.session.state).toBe("cita_booking_rejected");
    const shown = (sent(result)[0] as { text: string }).text;
    expect(shown).toBe("No pudimos agendar tu cita. Intenta de nuevo más tarde.");
    expect(shown).not.toContain("otra persona");
  });
});

describe("hora select", () => {
  const state = "cita_awaiting_hora_select";
  const base = at(state, horas, {
    citaCodEess: "0000123",
    citaEspecialidadId: "02",
    citaFecha: "22/09/2026",
    citaDni: "12345678",
  });

  it("a tap on an offered row books it", () => {
    const result = handle(base, tap("08:45|09:15"));

    expect(result.session.state).toBe("cita_booking_pending");
    expect(queries(result)[0]).toMatchObject({
      kind: "book_appointment",
      payload: { horaInicio: "08:45", fechaCita: "22/09/2026" },
    });
  });

  it("the pagination buttons keep working", () => {
    const result = handle(base, { from: FROM, type: "button", listId: "hora_pagina_siguiente" });

    expect(result.session.state).toBe("cita_hora_page_pending");
    expect(queries(result)[0].kind).toBe("list_horas");
  });

  it("typed text never books directly: a bare '1' is a list position and asks for confirmation", () => {
    const result = handle(base, text("1"));

    expect(result.session.state).toBe("cita_awaiting_hora_confirm");
    expect(result.session.slots.citaHoraConfirmId).toBe("08:00|08:30");
    expect(queries(result)).toHaveLength(0);
    expect(sent(result)[0]).toMatchObject({
      kind: "send_buttons",
      buttons: [
        { id: "hora_confirm_si", title: "Sí, confirmar" },
        { id: "hora_confirm_no", title: "No, ver horarios" },
      ],
    });
    expect((sent(result)[0] as { text: string }).text).toContain("8:00 AM - 8:30 AM");
  });

  it("unmatched text is rejected and the list re-shown", () => {
    expectRejectedAndReshown(handle(base, text("asdf")), state, horas);
  });

  it("a tap on an id that was not offered does not book", () => {
    const result = handle(base, tap("23:59|00:29"));

    expect(queries(result)).toHaveLength(0);
    expect(result.session.state).toBe(state);
  });
});

describe("fecha select — typed dates and AI fallback", () => {
  const state = "cita_awaiting_fecha_select";
  const base = () => at(state, fechas, { citaCodEess: "0000123", citaEspecialidadId: "02" });

  afterEach(() => {
    vi.useRealTimers();
  });

  function setToday(iso: string) {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(iso));
  }

  it("'mañana' picks tomorrow's offered date", () => {
    setToday("2026-09-21T15:00:00-05:00"); // Monday in Lima

    const result = handle(base(), text("mañana"));

    expect(result.session.state).toBe("cita_hora_pending");
    expect(queries(result)[0]).toMatchObject({ kind: "list_horas", payload: { fecha: "22/09/2026" } });
  });

  it("a date MINSA does not offer is explained and the list re-shown, never guessed", () => {
    setToday("2026-09-21T15:00:00-05:00");

    const result = handle(base(), text("el domingo"));

    expect(result.session.state).toBe(state);
    expect(queries(result)).toHaveLength(0);
    expect((sent(result)[0] as { text: string }).text).toContain("No hay cupos");
    expect(listRowsOf(result)).toEqual(fechas.rows);
  });

  it("a temporal phrase no rule can read goes to the AI once, validated against the offered dates", () => {
    const result = handle(base(), text("la próxima semana"));

    expect(result.session.state).toBe("cita_fecha_ai_pending");
    expect(queries(result)).toHaveLength(1);
    expect(queries(result)[0]).toMatchObject({
      kind: "resolve_fecha_ai",
      payload: {
        text: "la próxima semana",
        options: [
          { id: "22/09/2026", label: "22/09/2026" },
          { id: "23/09/2026", label: "23/09/2026" },
        ],
      },
    });
  });

  it("junk text does not spend an AI call", () => {
    expect(queries(handle(base(), text("asdf")))).toHaveLength(0);
  });

  it("an AI answer that is one of the offered dates is treated like a tap", () => {
    const pending = at("cita_fecha_ai_pending", fechas, { citaCodEess: "0000123", citaEspecialidadId: "02" });

    const result = handle(pending, queryResult("resolve_fecha_ai", { id: "23/09/2026" }));

    expect(result.session.state).toBe("cita_hora_pending");
    expect(queries(result)[0]).toMatchObject({ kind: "list_horas", payload: { fecha: "23/09/2026" } });
  });

  it.each([{ id: "31/12/2099" }, { id: null }, {}])(
    "an AI answer of %j returns to the list with an explanation and never reaches MINSA",
    (aiResult) => {
      const pending = at("cita_fecha_ai_pending", fechas);

      const result = handle(pending, queryResult("resolve_fecha_ai", aiResult));

      expect(result.session.state).toBe(state);
      expect(queries(result)).toHaveLength(0);
      expect((sent(result)[0] as { text: string }).text).toContain("No pudimos identificar");
      expect(listRowsOf(result)).toEqual(fechas.rows);
    },
  );
});

describe("especialidad/establecimiento — hints from a message that names more than one thing", () => {
  const especialidadState = "cita_awaiting_especialidad_select";
  const establecimientoState = "cita_awaiting_establecimiento_select";

  it("keeps the establishment named while choosing the specialty as a hint", () => {
    const result = handle(
      at(especialidadState, especialidades, { citaUbigeo: "150101" }),
      text("odontología en el hospital de Lurigancho"),
    );

    expect(result.session.state).toBe("cita_establecimiento_pending");
    expect(result.session.slots.citaEspecialidadId).toBe("02");
    expect(result.session.slots.citaEstablecimientoHintText).toBe("hospital lurigancho");
  });

  it("applies the hint when the establishment list arrives and matches exactly one row", () => {
    const pending = at("cita_establecimiento_pending", undefined, {
      citaEspecialidadId: "02",
      citaEstablecimientoHintText: "hospital lurigancho",
    });

    const result = handle(
      pending,
      queryResult("list_establecimientos", {
        status: "found",
        items: [
          { renipressCode: "0000123", establishmentName: "CENTRO DE SALUD SAN BORJA", quotasOnline: 10 },
          { renipressCode: "0000456", establishmentName: "HOSPITAL DE LURIGANCHO", quotasOnline: 4 },
        ],
      }),
    );

    expect(result.session.state).toBe("cita_fecha_pending");
    expect(result.session.slots.citaCodEess).toBe("0000456");
    expect(result.session.slots.citaEstablecimientoHintText).toBeUndefined();
    expect(queries(result)[0]).toMatchObject({ kind: "list_fechas", payload: { codEess: "0000456" } });
  });

  it("an ambiguous or non-matching hint just shows the normal list (and is discarded)", () => {
    const pending = at("cita_establecimiento_pending", undefined, {
      citaEspecialidadId: "02",
      citaEstablecimientoHintText: "hospital",
    });

    const result = handle(
      pending,
      queryResult("list_establecimientos", {
        status: "found",
        items: [
          { renipressCode: "1", establishmentName: "HOSPITAL A", quotasOnline: 1 },
          { renipressCode: "2", establishmentName: "HOSPITAL B", quotasOnline: 1 },
        ],
      }),
    );

    expect(result.session.state).toBe(establecimientoState);
    expect(queries(result)).toHaveLength(0);
    expect(result.session.slots.citaEstablecimientoHintText).toBeUndefined();
  });

  it("unmatched specialty text that looks like a word asks the AI for hints, once", () => {
    const result = handle(at(especialidadState, especialidades), text("cardiología"));

    expect(result.session.state).toBe("cita_selection_hints_pending");
    expect(result.session.slots.citaSelectionStep).toBe("especialidad");
    expect(queries(result)).toHaveLength(1);
    expect(queries(result)[0]).toMatchObject({
      kind: "extract_selection_hints",
      payload: { step: "especialidad", text: "cardiología" },
    });
  });

  it("junk does not spend an AI call", () => {
    expect(queries(handle(at(especialidadState, especialidades), text("asdf")))).toHaveLength(0);
    expect(queries(handle(at(especialidadState, especialidades), text("12345")))).toHaveLength(0);
  });

  it("an AI hint that names an offered specialty is treated like a tap and keeps the establishment hint", () => {
    const pending = at("cita_selection_hints_pending", especialidades, {
      citaSelectionStep: "especialidad",
      citaUbigeo: "150101",
    });

    const result = handle(
      pending,
      queryResult("extract_selection_hints", { especialidad: "Odontología", establecimiento: "Hospital de Lurigancho" }),
    );

    expect(result.session.state).toBe("cita_establecimiento_pending");
    expect(result.session.slots.citaEspecialidadId).toBe("02");
    expect(result.session.slots.citaEstablecimientoHintText).toBe("hospital lurigancho");
    expect(result.session.slots.citaSelectionStep).toBeUndefined();
  });

  it("an AI hint that matches nothing offered goes back to the list", () => {
    const pending = at("cita_selection_hints_pending", especialidades, { citaSelectionStep: "especialidad" });

    const result = handle(pending, queryResult("extract_selection_hints", { especialidad: "Cardiología" }));

    expect(result.session.state).toBe(especialidadState);
    expect(queries(result)).toHaveLength(0);
    expect((sent(result)[0] as { text: string }).text).toContain("No pudimos identificar");
    expect(listRowsOf(result)).toEqual(especialidades.rows);
  });

  it("at the establishment step an AI hint picks the offered establishment", () => {
    const pending = at("cita_selection_hints_pending", establecimientos, {
      citaSelectionStep: "establecimiento",
      citaEspecialidadId: "02",
    });

    const result = handle(pending, queryResult("extract_selection_hints", { establecimiento: "San Borja" }));

    expect(result.session.state).toBe("cita_fecha_pending");
    expect(queries(result)[0]).toMatchObject({ kind: "list_fechas", payload: { codEess: "0000123" } });
  });
});

describe("hora select — typed times (12h/24h) resolved against the whole day", () => {
  const state = "cita_awaiting_hora_select";
  const dayPacked =
    "07:00|07:30|1;08:00|08:30|2;08:45|09:15|1;13:00|13:30|2;13:15|13:45|1;13:45|14:15|1;14:30|15:00|1;19:00|19:30|1";
  const page: OfferedList = {
    text: "Selecciona el horario:",
    rows: [
      { id: "07:00|07:30", title: "07:00 - 07:30", description: "1 cupo(s) disponibles" },
      { id: "08:00|08:30", title: "08:00 - 08:30", description: "2 cupo(s) disponibles" },
    ],
  };
  const base = () =>
    at(state, page, {
      citaCodEess: "0000123",
      citaEspecialidadId: "02",
      citaFecha: "22/09/2026",
      citaDni: "12345678",
      citaHorasDia: dayPacked,
    });

  it("remembers the whole day's offer when a page of horarios is shown", () => {
    const result = handle(
      at("cita_hora_pending", undefined, { citaFecha: "31/12/2099" }),
      queryResult("list_horas", {
        status: "found",
        items: [
          { horaInicio: "08:00", horaFin: "08:30", cantidadCupos: 2 },
          { horaInicio: "08:45", horaFin: "09:15", cantidadCupos: 1 },
        ],
      }),
    );

    expect(result.session.slots.citaHorasDia).toBe("08:00|08:30|2;08:45|09:15|1");
  });

  it("an exact time on ANOTHER page still resolves, and asks for confirmation before booking", () => {
    const result = handle(base(), text("1:45 pm"));

    expect(result.session.state).toBe("cita_awaiting_hora_confirm");
    expect(result.session.slots.citaHoraConfirmId).toBe("13:45|14:15");
    expect(queries(result)).toHaveLength(0);
  });

  it("'a la 1' lists every offered slot in that hour instead of guessing", () => {
    const result = handle(base(), text("a la 1"));

    expect(result.session.state).toBe(state);
    expect(queries(result)).toHaveLength(0);
    expect(listRowsOf(result)?.map((row) => row.id)).toEqual(["13:00|13:30", "13:15|13:45", "13:45|14:15"]);
  });

  it("tapping a row of that filtered list books directly, as any tap does", () => {
    const narrowed = handle(base(), text("a la 1")).session;

    const result = handle(narrowed, tap("13:15|13:45"));

    expect(result.session.state).toBe("cita_booking_pending");
    expect(queries(result)[0]).toMatchObject({ kind: "book_appointment", payload: { horaInicio: "13:15" } });
  });

  it("'en la tarde' filters the day to the afternoon", () => {
    const result = handle(base(), text("en la tarde"));

    expect(listRowsOf(result)?.map((row) => row.id)).toEqual([
      "13:00|13:30",
      "13:15|13:45",
      "13:45|14:15",
      "14:30|15:00",
      "19:00|19:30",
    ]);
  });

  it("a time MINSA does not offer is explained and the list re-shown", () => {
    const result = handle(base(), text("a las 3"));

    expect(result.session.state).toBe(state);
    expect(queries(result)).toHaveLength(0);
    expect((sent(result)[0] as { text: string }).text).toContain("No hay horarios");
    expect(listRowsOf(result)).toEqual(page.rows);
  });

  it("works with only the visible page when the day's offer was not stored", () => {
    const legacy = at(state, page, { citaFecha: "22/09/2026", citaDni: "12345678" });

    const result = handle(legacy, text("8:00"));

    expect(result.session.state).toBe("cita_awaiting_hora_confirm");
    expect(result.session.slots.citaHoraConfirmId).toBe("08:00|08:30");
  });
});

describe("hora confirmation", () => {
  const state = "cita_awaiting_hora_confirm";
  const confirming = () =>
    at(state, horas, {
      citaCodEess: "0000123",
      citaEspecialidadId: "02",
      citaFecha: "22/09/2026",
      citaDni: "12345678",
      citaHoraConfirmId: "13:45|14:15",
      citaHorasDia: "13:45|14:15|1",
    });
  const button = (id: string): InboundEvent => ({ from: FROM, type: "button", listId: id });

  it("'Sí, confirmar' books the offered slot's own 24h start", () => {
    const result = handle(confirming(), button("hora_confirm_si"));

    expect(result.session.state).toBe("cita_booking_pending");
    expect(queries(result)[0]).toMatchObject({
      kind: "book_appointment",
      payload: { horaInicio: "13:45", fechaCita: "22/09/2026", numeroDocumentoPaciente: "12345678" },
    });
    expect(result.session.slots.citaHoraConfirmId).toBeUndefined();
    expect(result.session.slots.citaHorasDia).toBeUndefined();
    expect(result.session.slots.citaOffered).toBeUndefined();
  });

  it("typing 'sí' also confirms", () => {
    expect(queries(handle(confirming(), text("sí")))[0]).toMatchObject({ kind: "book_appointment" });
  });

  it("'No, ver horarios' goes back to the list without booking", () => {
    const result = handle(confirming(), button("hora_confirm_no"));

    expect(result.session.state).toBe("cita_awaiting_hora_select");
    expect(queries(result)).toHaveLength(0);
    expect(result.session.slots.citaHoraConfirmId).toBeUndefined();
    expect((sent(result)[0] as { text: string }).text).toContain("Sin problema");
    expect(listRowsOf(result)).toEqual(horas.rows);
  });

  it("anything else asks again and never books", () => {
    const result = handle(confirming(), text("quizás"));

    expect(result.session.state).toBe(state);
    expect(queries(result)).toHaveLength(0);
    expect(sent(result)[0]).toMatchObject({ kind: "send_buttons" });
  });
});
