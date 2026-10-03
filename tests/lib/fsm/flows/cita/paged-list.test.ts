import { describe, expect, it } from "vitest";
import { handle } from "@/lib/fsm/core/handlers";
import { isQueryEffect, offerPagedList, pageEffects } from "@/lib/fsm/core/handlers-shared";
import { readOffered } from "@/lib/fsm/parsing/selection-matchers";
import type { HandlerResult, InboundEvent, ListRow, QueryResultEvent, SendEffect, Session } from "@/lib/fsm/core/types";

const FROM = "sandbox-paged";
const text = (value: string): InboundEvent => ({ from: FROM, type: "text", text: value });
const tap = (id: string): InboundEvent => ({ from: FROM, type: "button", listId: id });
const queryResult = (queryKind: QueryResultEvent["queryKind"], result: unknown): QueryResultEvent => ({
  from: FROM,
  type: "query_result",
  queryKind,
  result,
});

const sent = (result: HandlerResult): SendEffect[] =>
  result.effects.filter((effect): effect is SendEffect => !isQueryEffect(effect));

const rows = (count: number): ListRow[] =>
  Array.from({ length: count }, (_, index) => ({ id: `R${index + 1}`, title: `Opción número ${index + 1}` }));

const listIds = (effects: SendEffect[]): string[] => {
  const list = effects.find((effect) => effect.kind === "send_interactive_list") as { rows: ListRow[] } | undefined;
  return list ? list.rows.map((row) => row.id) : [];
};

const buttonIds = (effects: SendEffect[]): string[] => {
  const buttons = effects.find((effect) => effect.kind === "send_buttons") as { buttons: Array<{ id: string }> } | undefined;
  return buttons ? buttons.buttons.map((button) => button.id) : [];
};

const blank = (): Session => ({ state: "cita_awaiting_especialidad_select", slots: {}, counters: {} });

describe("a list longer than WhatsApp's 10 rows is paged", () => {
  it("10 rows or fewer go out as a single list, exactly as before", () => {
    const effects = pageEffects("Selecciona:", rows(10), 0);

    expect(effects).toEqual([{ kind: "send_interactive_list", text: "Selecciona:", rows: rows(10) }]);
  });

  it("11 rows: the first page shows 10 rows and a «Ver más opciones» button", () => {
    const session = blank();
    const effects = offerPagedList(session, "Selecciona:", rows(11));

    expect(listIds(effects)).toEqual(rows(10).map((row) => row.id));
    expect(effects[1]).toEqual({
      kind: "send_buttons",
      text: "Mostrando 1 a 10 de 11 opciones.",
      buttons: [{ id: "lista_pagina_siguiente", title: "Ver más opciones" }],
    });
    expect(readOffered(session.slots)?.rows).toHaveLength(11);
    expect(session.counters.citaListPage ?? 0).toBe(0);
  });

  it("25 rows: the middle page offers both directions and the last one only goes back", () => {
    const middle = pageEffects("Selecciona:", rows(25), 1);
    expect(listIds(middle)).toEqual(rows(20).slice(10).map((row) => row.id));
    expect(buttonIds(middle)).toEqual(["lista_pagina_anterior", "lista_pagina_siguiente"]);
    expect((middle[1] as { text: string }).text).toBe("Mostrando 11 a 20 de 25 opciones.");

    const last = pageEffects("Selecciona:", rows(25), 2);
    expect(listIds(last)).toEqual(rows(25).slice(20).map((row) => row.id));
    expect(buttonIds(last)).toEqual(["lista_pagina_anterior"]);
  });

  it("the page buttons move through the pages of the list in play", () => {
    const listed = blank();
    offerPagedList(listed, "Selecciona la especialidad:", rows(25));

    const second = handle(listed, tap("lista_pagina_siguiente"));
    expect(second.session.state).toBe("cita_awaiting_especialidad_select");
    expect(listIds(sent(second))).toEqual(rows(20).slice(10).map((row) => row.id));

    const back = handle(second.session, tap("lista_pagina_anterior"));
    expect(listIds(sent(back))).toEqual(rows(10).map((row) => row.id));
  });

  it("typing the name of a row on another page still selects it", () => {
    const listed: Session = { ...blank(), slots: { citaUbigeo: "150132", citaBearer: "token" } };
    offerPagedList(listed, "Selecciona la especialidad:", rows(25));

    const result = handle(listed, text("opción número 23"));

    expect(result.session.state).toBe("cita_establecimiento_pending");
    expect(result.session.slots.citaEspecialidadId).toBe("R23");
  });

  it("an unrecognized answer shows the current page again, never all 25 rows", () => {
    const listed = blank();
    offerPagedList(listed, "Selecciona la especialidad:", rows(25));

    const result = handle(listed, text("123456789"));

    expect(listIds(sent(result))).toHaveLength(10);
  });
});

describe("the catalog lists that MINSA can return without a cap are paged", () => {
  it("12 especialidades go out as a page of 10 plus the button", () => {
    const pending: Session = { state: "cita_especialidad_pending", slots: { citaBearer: "token", citaUbigeo: "150132" }, counters: {} };
    const items = Array.from({ length: 12 }, (_, index) => ({
      codigoEspecialidad: `E${index + 1}`,
      nombreEspecialidad: `Especialidad ${index + 1}`,
      cantidadCupos: 1,
    }));

    const result = handle(pending, queryResult("list_especialidades", { status: "found", items }));

    expect(result.session.state).toBe("cita_awaiting_especialidad_select");
    expect(listIds(sent(result))).toHaveLength(10);
    expect(buttonIds(sent(result))).toEqual(["lista_pagina_siguiente"]);
  });

  it("12 fechas go out as a page of 10 plus the button", () => {
    const pending: Session = {
      state: "cita_fecha_pending",
      slots: { citaBearer: "token", citaCodEess: "0000123", citaEspecialidadId: "E1" },
      counters: {},
    };
    const items = Array.from({ length: 12 }, (_, index) => ({
      fechaCupo: `${String(index + 1).padStart(2, "0")}/12/2099`,
      cantidadCupos: 2,
    }));

    const result = handle(pending, queryResult("list_fechas", { status: "found", items }));

    expect(result.session.state).toBe("cita_awaiting_fecha_select");
    expect(listIds(sent(result))).toHaveLength(10);
    expect(buttonIds(sent(result))).toEqual(["lista_pagina_siguiente"]);
  });
});
