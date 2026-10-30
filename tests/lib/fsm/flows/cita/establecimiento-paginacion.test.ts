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

describe("establecimientos paginados por el MINSA", () => {
  it.each([
    ["the first page announces what was found", found(["1", "2"], 1, 3), "Encontramos estos establecimientos:"],
    [
      "without paging from MINSA the list also announces what was found",
      { status: "found", items: ["1", "2"].map(item) },
      "Encontramos estos establecimientos:",
    ],
    ["the following pages ask to choose", found(["6", "7"], 2, 3), "Selecciona el establecimiento:"],
  ])("%s", (_case, result, expected) => {
    expect(listText(handle(pending(), queryResult(result)))).toBe(expected);
  });

  it("offers a 'ver más' row and remembers the paging when there are more pages", () => {
    const result = handle(pending(), queryResult(found(["1", "2", "3", "4", "5"], 1, 5)));

    expect(result.session.state).toBe("cita_awaiting_establecimiento_select");
    expect(rowIds(result)).toEqual(["1", "2", "3", "4", "5", NEXT]);
    expect(result.session.counters[CounterKey.CITA_ESTABLECIMIENTOS_PAGE]).toBe(1);
    expect(result.session.counters[CounterKey.CITA_ESTABLECIMIENTOS_TOTAL_PAGES]).toBe(5);
  });

  it("offers both directions in a middle page", () => {
    const result = handle(pending(), queryResult(found(["6", "7"], 2, 5)));

    expect(rowIds(result)).toEqual(["6", "7", PREV, NEXT]);
  });

  it("offers only 'anteriores' in the last page and does not auto-pick a lone result", () => {
    const result = handle(pending(), queryResult(found(["25"], 5, 5)));

    expect(result.session.state).toBe("cita_awaiting_establecimiento_select");
    expect(rowIds(result)).toEqual(["25", PREV]);
  });

  it("asks to confirm the only establecimiento when there is a single page", () => {
    const result = handle(pending(), queryResult(found(["9"], 1, 1)));

    expect(result.session.state).toBe("cita_awaiting_establecimiento_confirm");
    expect(result.session.slots[SlotKey.CITA_COD_EESS]).toBeUndefined();
    expect(result.session.slots[SlotKey.CITA_ESTABLECIMIENTO_PROPUESTO]).toBe("9");
  });

  it("does not show an establecimiento without online quotas", () => {
    const result = handle(
      pending(),
      queryResult({ status: "found", items: [withoutQuotas("1"), item("2"), item("3")], page: 1, totalPages: 1 }),
    );

    expect(rowIds(result)).toEqual(["2", "3"]);
  });

  it("the paging rows do not carry the page numbers", () => {
    const rows = sent(handle(pending(), queryResult(found(["6", "7"], 2, 5)))).flatMap((effect) =>
      effect.kind === "send_interactive_list" ? effect.rows : [],
    );

    expect(rows.filter((row) => row.id === PREV || row.id === NEXT).map((row) => row.description)).toEqual([undefined, undefined]);
  });

  it("jumps to the next page when every establecimiento of this page has no quotas", () => {
    const result = handle(pending(), queryResult(emptyPage(1, 3)));

    expect(result.session.state).toBe("cita_establecimiento_pending");
    expect(queryOf(result)).toMatchObject({ payload: { page: 2 } });
  });

  it("offers another district or especialidad without jumping pages when MINSA answers empty", () => {
    const result = handle(pending(), queryResult({ status: "empty", page: 1, totalPages: 3 }));

    expect(result.session.state).toBe("cita_awaiting_other_distrito");
    expect(result.effects.some(isQueryEffect)).toBe(false);
    expect(result.session.counters[CounterKey.CITA_ESTABLECIMIENTOS_EMPTY_SKIPS]).toBeUndefined();
  });

  it("stops jumping over empty pages at the limit and offers another district or especialidad", () => {
    let result = handle(pending(), queryResult(emptyPage(1, 9)));
    const pages: number[] = [];
    for (let page = 2; result.session.state === "cita_establecimiento_pending"; page++) {
      pages.push(Number((queryOf(result).payload as { page: number }).page));
      result = handle(result.session, queryResult(emptyPage(page, 9)));
    }

    expect(pages).toHaveLength(ESTABLECIMIENTOS_MAX_EMPTY_PAGE_SKIPS);
    expect(result.session.state).toBe("cita_awaiting_other_distrito");
  });

  it("forgets the jumps once something is shown", () => {
    const skipped = handle(pending(), queryResult(emptyPage(1, 3)));
    const result = handle(skipped.session, queryResult(found(["6", "7"], 2, 3)));

    expect(rowIds(result)).toEqual(["6", "7", PREV, NEXT]);
    expect(Object.keys(result.session.counters).sort()).toEqual(
      [CounterKey.CITA_ESTABLECIMIENTOS_PAGE, CounterKey.CITA_ESTABLECIMIENTOS_TOTAL_PAGES].sort(),
    );
  });

  it("keeps going back when 'anteriores' lands on an empty page", () => {
    const listed = handle(pending(), queryResult(found(["11", "12"], 3, 5)));
    const back = handle(listed.session, tap(PREV));
    const result = handle(back.session, queryResult(emptyPage(2, 5)));

    expect(result.session.state).toBe("cita_establecimiento_pending");
    expect(queryOf(result)).toMatchObject({ payload: { page: 1 } });
  });

  it("shows the first page with results when there is no previous page left", () => {
    const listed = handle(pending(), queryResult(found(["6", "7"], 2, 5)));
    const back = handle(listed.session, tap(PREV));
    const returned = handle(back.session, queryResult(emptyPage(1, 5)));

    expect(queryOf(returned)).toMatchObject({ payload: { page: 2 } });
    expect(rowIds(handle(returned.session, queryResult(found(["6", "7"], 2, 5))))).toEqual(["6", "7", PREV, NEXT]);
  });

  it("works as before when the response carries no paging info", () => {
    const result = handle(pending(), queryResult({ status: "found", items: [item("1"), item("2")] }));

    expect(rowIds(result)).toEqual(["1", "2"]);
    expect(result.session.counters[CounterKey.CITA_ESTABLECIMIENTOS_TOTAL_PAGES]).toBeUndefined();
  });

  it("asks for the next page when the citizen taps 'ver más'", () => {
    const listed = handle(pending(), queryResult(found(["1", "2", "3", "4", "5"], 1, 5)));
    const result = handle(listed.session, tap(NEXT));

    expect(result.session.state).toBe("cita_establecimiento_pending");
    expect(queryOf(result)).toMatchObject({
      kind: "list_establecimientos",
      payload: { especialidadId: "222400", ubigeo: "150108", page: 2 },
    });
    expect(result.session.counters[CounterKey.CITA_ESTABLECIMIENTOS_PAGE]).toBe(2);
    expect(result.session.slots[SlotKey.CITA_OFFERED]).toBeUndefined();
  });

  it("goes back one page when the citizen taps 'anteriores'", () => {
    const listed = handle(pending(), queryResult(found(["6", "7"], 2, 5)));
    const result = handle(listed.session, tap(PREV));

    expect(queryOf(result)).toMatchObject({ payload: { page: 1 } });
  });

  it("keeps picking a real establecimiento as before", () => {
    const listed = handle(pending(), queryResult(found(["1", "2", "3"], 1, 2)));
    const result = handle(listed.session, tap("2"));

    expect(result.session.state).toBe("cita_fecha_pending");
    expect(result.session.slots[SlotKey.CITA_COD_EESS]).toBe("2");
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
});
