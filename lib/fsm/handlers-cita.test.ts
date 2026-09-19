import { describe, expect, it } from "vitest";
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
      handle(at("cita_awaiting_especialidad_select", especialidades), text("cardiología")),
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

  it("typed text never books directly and is rejected until it can be confirmed", () => {
    const result = handle(base, text("1"));

    expect(result.session.state).toBe(state);
    expect(queries(result)).toHaveLength(0);
    expect(listRowsOf(result)).toEqual(horas.rows);
  });

  it("a tap on an id that was not offered does not book", () => {
    const result = handle(base, tap("23:59|00:29"));

    expect(queries(result)).toHaveLength(0);
    expect(result.session.state).toBe(state);
  });
});
