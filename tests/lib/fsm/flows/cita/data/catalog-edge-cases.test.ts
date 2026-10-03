import { describe, expect, it } from "vitest";
import { handle } from "@/lib/fsm/core/handlers";
import { isQueryEffect } from "@/lib/fsm/core/handlers-shared";
import { formatEspecialidadName, formatEstablecimientoName } from "@/lib/fsm/flows/cita/data/catalog-names";
import { matchSelection, type OfferedRow } from "@/lib/fsm/parsing/selection/selection-matchers";
import type { HandlerResult, InboundEvent, QueryResultEvent, SendEffect, Session } from "@/lib/fsm/core/types";

const FROM = "sandbox-catalog-edge";
const text = (value: string): InboundEvent => ({ from: FROM, type: "text", text: value });
const tap = (id: string): InboundEvent => ({ from: FROM, type: "list", listId: id });
const queryResult = (queryKind: QueryResultEvent["queryKind"], result: unknown): QueryResultEvent => ({
  from: FROM,
  type: "query_result",
  queryKind,
  result,
});
const sent = (result: HandlerResult): SendEffect[] =>
  result.effects.filter((effect): effect is SendEffect => !isQueryEffect(effect));

const pending = (state: string, slots: Session["slots"] = {}): Session => ({
  state,
  slots: { citaBearer: "token", citaDni: "12345678", citaUbigeo: "150132", ...slots },
  counters: {},
});

const catalogRows: OfferedRow[] = [
  { id: "222400", title: "Medicina General", description: "Medicina General / Atención del Adulto · 1312 cupos" },
  { id: "221900", title: "Odontología General", description: "27 cupos" },
];

const LONG_ESPECIALIDAD = "CONSULTA EXTERNA-MEDICINA FISICA Y REHABILITACION / TERAPIA FISICA DEL ADULTO MAYOR Y DEL NIÑO-";
const LONG_ESTABLECIMIENTO = "HOSPITAL NACIONAL DOCENTE MADRE NIÑO SAN BARTOLOME DE LIMA METROPOLITANA SEDE CENTRAL";

describe("typed numbers never match a row's quota count", () => {
  it("a number above the row count matches nothing, even if a row has that many cupos", () => {
    expect(matchSelection("27", catalogRows, { includeDescription: true })).toEqual({ kind: "none" });
  });

  it("the word cupos alone matches nothing", () => {
    expect(matchSelection("cupos", catalogRows, { includeDescription: true })).toEqual({ kind: "none" });
  });

  it("the name part of the description still matches", () => {
    expect(matchSelection("atención del adulto", catalogRows, { includeDescription: true })).toEqual({
      kind: "match",
      row: catalogRows[0],
    });
  });

  it("positions keep working", () => {
    expect(matchSelection("2", catalogRows, { includeDescription: true })).toEqual({ kind: "match", row: catalogRows[1] });
  });

  it("ubigeo descriptions keep matching by province and department", () => {
    const ubigeoRows: OfferedRow[] = [
      { id: "070102", title: "Bellavista", description: "Callao — Callao" },
      { id: "200801", title: "Bellavista", description: "Sullana — Piura" },
    ];
    expect(matchSelection("callao", ubigeoRows, { includeDescription: true })).toEqual({ kind: "match", row: ubigeoRows[0] });
  });

  it("typing 27 in the especialidad list shows the list again instead of picking the row with 27 cupos", () => {
    const listed = handle(
      pending("cita_especialidad_pending"),
      queryResult("list_especialidades", {
        status: "found",
        items: [
          { codigoEspecialidad: "222400", nombreEspecialidad: "CONSULTA EXTERNA-MEDICINA GENERAL / ATENCIÓN DEL ADULTO-", cantidadCupos: 1312 },
          { codigoEspecialidad: "221900", nombreEspecialidad: "CONSULTA EXTERNA-ODONTOLOGÍA GENERAL-", cantidadCupos: 27 },
        ],
      }),
    );

    const result = handle(listed.session, text("27"));

    expect(result.session.state).toBe("cita_awaiting_especialidad_select");
    expect(result.session.slots.citaEspecialidadId).toBeUndefined();
  });
});

describe("the stored full name is never cut by the row description limit", () => {
  it("a picked especialidad longer than 70 characters is stored whole", () => {
    const full = formatEspecialidadName(LONG_ESPECIALIDAD).full;
    expect(full.length).toBeGreaterThan(70);

    const listed = handle(
      pending("cita_especialidad_pending"),
      queryResult("list_especialidades", {
        status: "found",
        items: [
          { codigoEspecialidad: "300100", nombreEspecialidad: LONG_ESPECIALIDAD, cantidadCupos: 5 },
          { codigoEspecialidad: "221900", nombreEspecialidad: "CONSULTA EXTERNA-ODONTOLOGÍA GENERAL-", cantidadCupos: 27 },
        ],
      }),
    );
    const result = handle(listed.session, tap("300100"));

    expect(result.session.slots.citaEspecialidadNombre).toBe(full);
  });

  it("a picked establecimiento longer than 70 characters is stored whole and named whole when it has no dates", () => {
    const full = formatEstablecimientoName(LONG_ESTABLECIMIENTO).full;
    expect(full.length).toBeGreaterThan(70);

    const base = pending("cita_establecimiento_pending", { citaEspecialidadId: "222400", citaDistrito: "SAN JUAN DE LURIGANCHO" });
    const items = [
      { renipressCode: "0009", establishmentName: LONG_ESTABLECIMIENTO, quotasOnline: 4 },
      { renipressCode: "0002", establishmentName: "CENTRO DE SALUD SAN FERNANDO", quotasOnline: 3 },
    ];
    const listed = handle(base, queryResult("list_establecimientos", { status: "found", items }));
    const picked = handle(listed.session, tap("0009"));
    expect(picked.session.slots.citaEstablecimientoNombre).toBe(full);

    const noDates = handle(picked.session, queryResult("list_fechas", { status: "empty" }));
    const offered = handle(noDates.session, queryResult("list_establecimientos", { status: "found", items }));

    const question = sent(offered).find((effect) => effect.kind === "send_buttons");
    expect(question && question.kind === "send_buttons" ? question.text : "").toContain(`No hay fechas disponibles en *${full}*.`);
  });
});
