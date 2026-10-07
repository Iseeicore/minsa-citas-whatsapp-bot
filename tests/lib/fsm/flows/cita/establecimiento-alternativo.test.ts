import { describe, expect, it } from "vitest";
import { handle } from "@/lib/fsm/core/handlers";
import { isQueryEffect } from "@/lib/fsm/core/handlers-shared";
import { AUTHENTICATED_WAITING_STATES, resumeStateFor } from "@/lib/fsm/session/session-expiry-guard";
import type { HandlerResult, InboundEvent, QueryResultEvent, SendEffect, Session } from "@/lib/fsm/core/types";
import { SlotKey } from "@/lib/enums/slot-key";

const FROM = "sandbox-establecimiento";
const text = (value: string): InboundEvent => ({ from: FROM, type: "text", text: value });
const tap = (id: string): InboundEvent => ({ from: FROM, type: "button", listId: id });
const queryResult = (queryKind: QueryResultEvent["queryKind"], result: unknown): QueryResultEvent => ({
  from: FROM,
  type: "query_result",
  queryKind,
  result,
});

const queries = (result: HandlerResult) => result.effects.filter(isQueryEffect);
const sent = (result: HandlerResult): SendEffect[] =>
  result.effects.filter((effect): effect is SendEffect => !isQueryEffect(effect));

const FAREWELL =
  "Gracias por comunicarte con el *Ministerio de Salud del Perú*. Cuando quieras volver a intentarlo, escríbenos nuevamente. ¡Que tengas un buen día! 👋";

const fechaPending = (extra: Session["slots"] = {}): Session => ({
  state: "cita_fecha_pending",
  slots: {
    [SlotKey.CITA_BEARER]: "token",
    [SlotKey.CITA_UBIGEO]: "150132",
    [SlotKey.CITA_DISTRITO]: "SAN JUAN DE LURIGANCHO",
    [SlotKey.CITA_ESPECIALIDAD_ID]: "02",
    [SlotKey.CITA_ESPECIALIDAD_NOMBRE]: "Odontología",
    [SlotKey.CITA_COD_EESS]: "0000123",
    [SlotKey.CITA_ESTABLECIMIENTO_NOMBRE]: "CS SAN BORJA",
    ...extra,
  },
  counters: {},
});

const noDates = (session: Session = fechaPending()) =>
  handle(session, queryResult("list_fechas", { status: "empty" }));

const establecimientos = (session: Session, items: { renipressCode: string; establishmentName: string }[]) =>
  handle(
    session,
    queryResult("list_establecimientos", {
      status: "found",
      items: items.map((item) => ({ ...item, quotasOnline: 3 })),
    }),
  );

describe("the chosen establecimiento has no dates: another one is offered", () => {
  it("discards it and asks MINSA for the establecimientos again", () => {
    const result = noDates();

    expect(result.session.state).toBe("cita_establecimiento_pending");
    expect(result.session.slots[SlotKey.CITA_ESTABLECIMIENTOS_DESCARTADOS]).toBe("0000123");
    expect(result.session.slots[SlotKey.CITA_COD_EESS]).toBeUndefined();
    expect(queries(result)).toEqual([
      { kind: "list_establecimientos", payload: { especialidadId: "02", ubigeo: "150132", page: 1 } },
    ]);
  });

  it("with exactly one left, asks whether to search there, with buttons", () => {
    const result = establecimientos(noDates().session, [
      { renipressCode: "0000123", establishmentName: "CS SAN BORJA" },
      { renipressCode: "0000456", establishmentName: "HOSPITAL LURIGANCHO" },
    ]);

    expect(result.session.state).toBe("cita_awaiting_other_establecimiento");
    expect(sent(result)).toEqual([
      {
        kind: "send_buttons",
        text: "No hay fechas disponibles en *CS SAN BORJA*. ¿Quieres buscar en *Hospital Lurigancho*?",
        buttons: [
          { id: "cita_otro_establecimiento_si", title: "Sí, buscar ahí" },
          { id: "cita_otro_establecimiento_no", title: "No, salir" },
        ],
      },
    ]);
  });

  it.each([
    ["the button", tap("cita_otro_establecimiento_si")],
    ["«sí»", text("sí")],
    ["«dale»", text("dale")],
  ])("yes (%s) looks for dates in the proposed one", (_label, answer) => {
    const asked = establecimientos(noDates().session, [{ renipressCode: "0000456", establishmentName: "HOSPITAL LURIGANCHO" }]);
    const result = handle(asked.session, answer);

    expect(result.session.state).toBe("cita_fecha_pending");
    expect(result.session.slots[SlotKey.CITA_COD_EESS]).toBe("0000456");
    expect(sent(result)).toEqual([{ kind: "send_text", text: "Buscando fechas disponibles…" }]);
    expect(queries(result)).toEqual([{ kind: "list_fechas", payload: { codEess: "0000456", especialidadId: "02" } }]);
  });

  it.each([
    ["the button", tap("cita_otro_establecimiento_no")],
    ["«no»", text("no")],
    ["«salir»", text("salir")],
  ])("no (%s) closes with the farewell", (_label, answer) => {
    const asked = establecimientos(noDates().session, [{ renipressCode: "0000456", establishmentName: "HOSPITAL LURIGANCHO" }]);
    const result = handle(asked.session, answer);

    expect(result.session.state).toBe("cita_declined_closed");
    expect(sent(result)).toEqual([{ kind: "send_text", text: FAREWELL }]);
  });

  it("an unrecognised answer repeats the question", () => {
    const asked = establecimientos(noDates().session, [{ renipressCode: "0000456", establishmentName: "HOSPITAL LURIGANCHO" }]);
    const result = handle(asked.session, text("asdf"));

    expect(result.session.state).toBe("cita_awaiting_other_establecimiento");
    expect(sent(result)[0]).toMatchObject({ kind: "send_buttons", text: "¿Quieres buscar en *Hospital Lurigancho*?" });
  });

  it("with several left, lists them after saying they also offer the especialidad", () => {
    const result = establecimientos(noDates().session, [
      { renipressCode: "0000123", establishmentName: "CS SAN BORJA" },
      { renipressCode: "0000456", establishmentName: "HOSPITAL LURIGANCHO" },
      { renipressCode: "0000789", establishmentName: "CS SANTA ANITA" },
    ]);

    expect(result.session.state).toBe("cita_awaiting_establecimiento_select");
    expect(sent(result)[0]).toEqual({
      kind: "send_text",
      text: "No hay fechas disponibles en *CS SAN BORJA*. Estos establecimientos también atienden *Odontología*:",
    });
    const list = sent(result)[1] as { kind: string; rows: { id: string }[] };
    expect(list.kind).toBe("send_interactive_list");
    expect(list.rows.map((row) => row.id)).toEqual(["0000456", "0000789"]);
  });

  it("with none left, asks about another nearby district", () => {
    const result = establecimientos(noDates().session, [{ renipressCode: "0000123", establishmentName: "CS SAN BORJA" }]);

    expect(result.session.state).toBe("cita_awaiting_other_distrito");
    expect(sent(result)[0]).toMatchObject({ kind: "send_buttons" });
  });

  it("the second empty establecimiento is discarded too, so the search never offers it again", () => {
    const asked = establecimientos(noDates().session, [{ renipressCode: "0000456", establishmentName: "HOSPITAL LURIGANCHO" }]);
    const searching = handle(asked.session, text("sí"));
    const second = noDates(searching.session);

    expect(second.session.slots[SlotKey.CITA_ESTABLECIMIENTOS_DESCARTADOS]).toBe("0000123,0000456");
  });

  it("without a stored name it still asks, without inventing one", () => {
    const result = establecimientos(noDates(fechaPending({ [SlotKey.CITA_ESTABLECIMIENTO_NOMBRE]: undefined as unknown as string })).session, [
      { renipressCode: "0000456", establishmentName: "HOSPITAL LURIGANCHO" },
    ]);

    expect(sent(result)[0]).toMatchObject({
      text: "No hay fechas disponibles en ese establecimiento. ¿Quieres buscar en *Hospital Lurigancho*?",
    });
  });

  it("dates declined earlier still close with the apology, as before", () => {
    const result = noDates(fechaPending({ [SlotKey.CITA_FECHAS_DESCARTADAS]: "31/12/2099" }));

    expect(result.session.state).toBe("cita_declined_closed");
  });

  it("the new question survives an idle session like the other waiting steps", () => {
    expect(AUTHENTICATED_WAITING_STATES).toContain("cita_awaiting_other_establecimiento");
    expect(resumeStateFor("cita_awaiting_other_establecimiento")).toBe("cita_establecimiento_pending");
  });

  it("remembers the name of an establecimiento picked from the list", () => {
    const listed = establecimientos(
      { state: "cita_establecimiento_pending", slots: { [SlotKey.CITA_BEARER]: "token", [SlotKey.CITA_ESPECIALIDAD_ID]: "02", [SlotKey.CITA_UBIGEO]: "150132" }, counters: {} },
      [
        { renipressCode: "0000456", establishmentName: "HOSPITAL LURIGANCHO" },
        { renipressCode: "0000789", establishmentName: "CS SANTA ANITA" },
      ],
    );
    const picked = handle(listed.session, { from: FROM, type: "list", listId: "0000789" });

    expect(picked.session.slots[SlotKey.CITA_ESTABLECIMIENTO_NOMBRE]).toBe("CS Santa Anita");
  });
});
