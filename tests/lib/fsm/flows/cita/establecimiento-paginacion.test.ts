import { describe, expect, it } from "vitest";
import { handle } from "@/lib/fsm/core/handlers";
import { isQueryEffect } from "@/lib/fsm/core/handlers-shared";
import type { HandlerResult, InboundEvent, QueryEffect, QueryResultEvent, SendEffect, Session } from "@/lib/fsm/core/types";
import { SlotKey } from "@/lib/enums/slot-key";
import { CounterKey } from "@/lib/enums/counter-key";
import { InternalEventType } from "@/lib/enums/internal-event-type";
import { ESTABLECIMIENTOS_MAX_EMPTY_PAGE_SKIPS } from "@/lib/constants/limits/minsa";

const FROM = "sandbox-estab-pages";
const tap = (id: string): InboundEvent => ({ channel: "whatsapp", from: FROM, type: "list", listId: id });
const queryResult = (result: unknown): QueryResultEvent => ({
  channel: "whatsapp",
  from: FROM,
  type: InternalEventType.QUERY_RESULT,
  queryKind: "list_establecimientos",
  result,
});

const sent = (result: HandlerResult): SendEffect[] => result.effects.filter((effect): effect is SendEffect => !isQueryEffect(effect));
const queryOf = (result: HandlerResult): QueryEffect => {
  const found = result.effects.find(isQueryEffect);
  if (!found) throw new Error("no query sent");
  return found;
};
const listOf = (result: HandlerResult) => {
  const list = sent(result).find((effect) => effect.kind === "send_interactive_list");
  if (!list || list.kind !== "send_interactive_list") throw new Error("no list sent");
  return list;
};
const listText = (result: HandlerResult): string => listOf(result).text;
const rowIds = (result: HandlerResult): string[] => listOf(result).rows.map((row) => row.id);

const NEXT = "cita_establecimientos_pagina_siguiente";
const PREV = "cita_establecimientos_pagina_anterior";

const item = (code: string) => ({ renipressCode: code, establishmentName: `CENTRO DE SALUD ${code}`, quotasOnline: 2 });
const withoutQuotas = (code: string) => ({ ...item(code), quotasOnline: 0 });
const found = (codes: string[], page: number, totalPages: number) => ({
  status: "found",
  items: codes.map(item),
  page,
  totalPages,
});
const emptyPage = (page: number, totalPages: number) => ({ status: "found", items: [withoutQuotas(`x${page}`)], page, totalPages });

const pending = (slots: Session["slots"] = {}, counters: Session["counters"] = {}): Session => ({
  state: "cita_establecimiento_pending",
  slots: {
    [SlotKey.CITA_BEARER]: "token",
    [SlotKey.CITA_UBIGEO]: "150108",
    [SlotKey.CITA_ESPECIALIDAD_ID]: "222400",
    ...slots,
  },
  counters,
});

const shown = (session: Session, page: object, probe: object): HandlerResult =>
  handle(handle(session, queryResult(page)).session, queryResult(probe));
const FIRST_IS_ONE = { [CounterKey.CITA_ESTABLECIMIENTOS_FIRST_PAGE]: 1 };

describe("establecimientos paginados por el MINSA", () => {
  it("announces the first page with quotas and asks to choose in the following ones", () => {
    expect(listText(handle(pending(), queryResult(found(["1", "2"], 1, 1))))).toBe("Encontramos estos establecimientos:");
    expect(listText(handle(pending(), queryResult({ status: "found", items: ["1", "2"].map(item) })))).toBe(
      "Encontramos estos establecimientos:",
    );
    expect(listText(handle(pending({}, FIRST_IS_ONE), queryResult(found(["6", "7"], 2, 2))))).toBe("Selecciona el establecimiento:");
    expect(listText(shown(pending(), emptyPage(1, 3), found(["6", "7"], 2, 2)))).toBe("Encontramos estos establecimientos:");
  });

  it("looks at the next page before offering «Ver más», and remembers the paging", () => {
    const probing = handle(pending(), queryResult(found(["1", "2", "3", "4", "5"], 1, 5)));
    expect(probing.session.state).toBe("cita_establecimiento_pending");
    expect(queryOf(probing)).toMatchObject({ payload: { page: 2 } });
    expect(sent(probing)).toEqual([]);

    const result = handle(probing.session, queryResult(found(["6"], 2, 5)));
    expect(result.session.state).toBe("cita_awaiting_establecimiento_select");
    expect(rowIds(result)).toEqual(["1", "2", "3", "4", "5", NEXT]);
    expect(result.session.counters[CounterKey.CITA_ESTABLECIMIENTOS_PAGE]).toBe(1);
    expect(result.session.counters[CounterKey.CITA_ESTABLECIMIENTOS_NEXT_PAGE]).toBe(2);
    expect(result.session.slots[SlotKey.CITA_ESTABLECIMIENTOS_RETENIDOS]).toBeUndefined();
    expect(Object.keys(result.session.counters).sort()).toEqual(
      [
        CounterKey.CITA_ESTABLECIMIENTOS_PAGE,
        CounterKey.CITA_ESTABLECIMIENTOS_TOTAL_PAGES,
        CounterKey.CITA_ESTABLECIMIENTOS_FIRST_PAGE,
        CounterKey.CITA_ESTABLECIMIENTOS_NEXT_PAGE,
      ].sort(),
    );

    const more = handle(result.session, tap(NEXT));
    expect(queryOf(more)).toMatchObject({
      kind: "list_establecimientos",
      payload: { especialidadId: "222400", ubigeo: "150108", page: 2 },
    });
    expect(more.session.slots[SlotKey.CITA_OFFERED]).toBeUndefined();
  });

  it("offers both directions in a middle page, «Ver anteriores» alone in the last one, and rows without page numbers", () => {
    const middle = shown(pending({}, FIRST_IS_ONE), found(["6", "7"], 2, 5), found(["8"], 3, 5));
    expect(rowIds(middle)).toEqual(["6", "7", PREV, NEXT]);
    expect(
      listOf(middle)
        .rows.filter((row) => row.id === PREV || row.id === NEXT)
        .map((row) => row.description),
    ).toEqual([undefined, undefined]);

    const last = handle(pending({}, FIRST_IS_ONE), queryResult(found(["25"], 5, 5)));
    expect(last.session.state).toBe("cita_awaiting_establecimiento_select");
    expect(rowIds(last)).toEqual(["25", PREV]);

    const lone = handle(pending(), queryResult(found(["9"], 1, 1)));
    expect(lone.session.state).toBe("cita_awaiting_establecimiento_confirm");
    expect(lone.session.slots[SlotKey.CITA_ESTABLECIMIENTO_PROPUESTO]).toBe("9");
  });

  it("hides establecimientos without online quotas and jumps over pages without any", () => {
    const quotas = handle(
      pending(),
      queryResult({ status: "found", items: [withoutQuotas("1"), item("2"), item("3")], page: 1, totalPages: 1 }),
    );
    expect(rowIds(quotas)).toEqual(["2", "3"]);

    const jumped = handle(pending(), queryResult(emptyPage(1, 3)));
    expect(jumped.session.state).toBe("cita_establecimiento_pending");
    expect(queryOf(jumped)).toMatchObject({ payload: { page: 2 } });

    const empty = handle(pending(), queryResult({ status: "empty", page: 1, totalPages: 3 }));
    expect(empty.session.state).toBe("cita_awaiting_other_distrito");
    expect(empty.session.counters[CounterKey.CITA_ESTABLECIMIENTOS_EMPTY_SKIPS]).toBeUndefined();

    let result = handle(pending(), queryResult(emptyPage(1, 9)));
    const pages: number[] = [];
    for (let page = 2; result.session.state === "cita_establecimiento_pending"; page++) {
      pages.push(Number((queryOf(result).payload as { page: number }).page));
      result = handle(result.session, queryResult(emptyPage(page, 9)));
    }
    expect(pages).toHaveLength(ESTABLECIMIENTOS_MAX_EMPTY_PAGE_SKIPS);
    expect(result.session.state).toBe("cita_awaiting_other_distrito");
  });

  it("goes back with «Ver anteriores», over empty pages, to the first page with results", () => {
    const listed = shown(pending({}, FIRST_IS_ONE), found(["11", "12"], 3, 5), found(["13"], 4, 5));
    const back = handle(listed.session, tap(PREV));
    expect(queryOf(back)).toMatchObject({ payload: { page: 2 } });
    const empty = handle(back.session, queryResult(emptyPage(2, 5)));
    expect(queryOf(empty)).toMatchObject({ payload: { page: 1 } });

    const second = shown(pending({}, FIRST_IS_ONE), found(["6", "7"], 2, 5), found(["8"], 3, 5));
    const returned = handle(handle(second.session, tap(PREV)).session, queryResult(emptyPage(1, 5)));
    expect(queryOf(returned)).toMatchObject({ payload: { page: 2 } });
  });

  it("works as before without paging info and keeps picking a real establecimiento", () => {
    const plain = handle(pending(), queryResult({ status: "found", items: [item("1"), item("2")] }));
    expect(rowIds(plain)).toEqual(["1", "2"]);
    expect(plain.session.counters[CounterKey.CITA_ESTABLECIMIENTOS_TOTAL_PAGES]).toBeUndefined();

    const picked = handle(plain.session, tap("2"));
    expect(picked.session.state).toBe("cita_fecha_pending");
    expect(picked.session.slots[SlotKey.CITA_COD_EESS]).toBe("2");
  });

  it("moves to the next page instead of giving up when every establecimiento of this page was discarded", () => {
    const searching = pending(
      {
        [SlotKey.CITA_ESTABLECIMIENTO_SIN_FECHAS]: "CENTRO DE SALUD 1",
        [SlotKey.CITA_ESTABLECIMIENTOS_DESCARTADOS]: "1,2",
      },
      { [CounterKey.CITA_ESTABLECIMIENTOS_PAGE]: 1, [CounterKey.CITA_ESTABLECIMIENTOS_TOTAL_PAGES]: 2 },
    );
    const result = handle(searching, queryResult(found(["1", "2"], 1, 2)));

    expect(result.session.state).toBe("cita_establecimiento_pending");
    expect(queryOf(result)).toMatchObject({ payload: { page: 2 } });
    expect(result.session.slots[SlotKey.CITA_ESTABLECIMIENTO_SIN_FECHAS]).toBe("CENTRO DE SALUD 1");
  });

  it("offers another district only after the last page is exhausted", () => {
    const searching = pending(
      {
        [SlotKey.CITA_ESTABLECIMIENTO_SIN_FECHAS]: "CENTRO DE SALUD 1",
        [SlotKey.CITA_ESTABLECIMIENTOS_DESCARTADOS]: "1,2",
      },
      { [CounterKey.CITA_ESTABLECIMIENTOS_PAGE]: 2, [CounterKey.CITA_ESTABLECIMIENTOS_TOTAL_PAGES]: 2 },
    );
    const result = handle(searching, queryResult(found(["1", "2"], 2, 2)));

    expect(result.session.state).toBe("cita_awaiting_other_distrito");
  });

  it("shows «Ver anteriores» and «Ver más» only when that page has establecimientos with quotas", () => {
    let step = handle(pending(), queryResult(emptyPage(1, 3)));
    step = handle(step.session, queryResult(found(["9"], 2, 3)));
    expect(queryOf(step)).toMatchObject({ payload: { page: 3 } });
    step = handle(step.session, queryResult(emptyPage(3, 3)));

    expect(step.session.state).toBe("cita_awaiting_establecimiento_confirm");
    expect(step.session.slots[SlotKey.CITA_ESTABLECIMIENTO_PROPUESTO]).toBe("9");
    expect(sent(step).some((effect) => effect.kind === "send_interactive_list")).toBe(false);

    const first = handle(pending(), queryResult(found(["1", "2"], 1, 4)));
    expect(queryOf(first)).toMatchObject({ payload: { page: 2 } });
    expect(rowIds(handle(first.session, queryResult({ status: "error" })))).toEqual(["1", "2"]);
    const probed = handle(handle(first.session, queryResult(emptyPage(2, 4))).session, queryResult(found(["7"], 3, 4)));
    expect(rowIds(probed)).toEqual(["1", "2", NEXT]);

    const more = handle(probed.session, tap(NEXT));
    expect(queryOf(more)).toMatchObject({ payload: { page: 3 } });
    const last = handle(more.session, queryResult(found(["7", "8"], 3, 4)));
    expect(rowIds(handle(last.session, queryResult(emptyPage(4, 4))))).toEqual(["7", "8", PREV]);
  });
});
