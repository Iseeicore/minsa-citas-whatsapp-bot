import { describe, expect, it } from "vitest";
import { handle } from "@/lib/fsm/core/handlers";
import { findLimitViolations } from "@/lib/whatsapp/message-limits";
import type { HandlerResult, Session } from "@/lib/fsm/core/types";
import { SlotKey } from "@/lib/enums/slot-key";
import { CounterKey } from "@/lib/enums/counter-key";
import { EstablecimientoConfirmButtonId } from "@/lib/enums/establecimiento-confirm-button-id";
import { OtherDistritoButtonId } from "@/lib/enums/other-distrito-button-id";
import { ExitButtonId } from "@/lib/enums/exit-button-id";
import { queries, queryResult, sent, tap, text } from "@/tests/support/fsm-events";

const buttonsOf = (result: HandlerResult) => {
  const buttons = sent(result).find((effect) => effect.kind === "send_buttons");
  if (!buttons || buttons.kind !== "send_buttons") throw new Error("no buttons sent");
  return buttons;
};

const item = (code: string, name: string, quotasOnline = 4) => ({ renipressCode: code, establishmentName: name, quotasOnline });
const SAN_FERNANDO = item("0002", "CENTRO DE SALUD SAN FERNANDO");
const UNANUE = item("0001", "HOSPITAL NACIONAL HIPOLITO UNANUE");

const pending = (slots: Session["slots"] = {}): Session => ({
  state: "cita_establecimiento_pending",
  slots: {
    [SlotKey.CITA_BEARER]: "token",
    [SlotKey.CITA_DISTRITO]: "SAN JUAN DE LURIGANCHO",
    [SlotKey.CITA_UBIGEO]: "150132",
    [SlotKey.CITA_ESPECIALIDAD_ID]: "221900",
    [SlotKey.CITA_ESPECIALIDAD_NOMBRE]: "Odontología General",
    ...slots,
  },
  counters: {},
});

const listed = (items: unknown[], slots: Session["slots"] = {}) =>
  handle(pending(slots), queryResult("list_establecimientos", { status: "found", items, page: 1, totalPages: 1 }));

const CONFIRM_TEXT =
  "Encontramos este establecimiento: *Centro de Salud San Fernando*.\n\n*¿Deseas agendar tu cita en este establecimiento?*";

describe("un único establecimiento con cupos", () => {
  it("asks to confirm it in a single button message", () => {
    const result = listed([SAN_FERNANDO]);

    expect(result.session.state).toBe("cita_awaiting_establecimiento_confirm");
    expect(sent(result)).toHaveLength(1);
    expect(buttonsOf(result).text).toBe(CONFIRM_TEXT);
    expect(buttonsOf(result).buttons).toEqual([
      { id: EstablecimientoConfirmButtonId.CONFIRM, title: "Confirmar" },
      { id: EstablecimientoConfirmButtonId.OTHER_SEDE, title: "Otra sede" },
    ]);
    expect(findLimitViolations(buttonsOf(result))).toEqual([]);
    expect(queries(result)).toEqual([]);
    expect(result.session.slots[SlotKey.CITA_ESTABLECIMIENTO_PROPUESTO]).toBe("0002");
    expect(result.session.slots[SlotKey.CITA_ESTABLECIMIENTO_PROPUESTO_NOMBRE]).toBe("Centro de Salud San Fernando");
  });

  it("asks too when the other establecimientos have no quotas", () => {
    const result = listed([{ ...UNANUE, quotasOnline: 0 }, SAN_FERNANDO]);

    expect(result.session.state).toBe("cita_awaiting_establecimiento_confirm");
    expect(buttonsOf(result).text).toBe(CONFIRM_TEXT);
  });

  it("still picks the establecimiento the citizen named, without asking", () => {
    const result = listed([SAN_FERNANDO], { [SlotKey.CITA_ESTABLECIMIENTO_HINT_TEXT]: "San Fernando" });

    expect(result.session.state).toBe("cita_fecha_pending");
    expect(result.session.slots[SlotKey.CITA_COD_EESS]).toBe("0002");
    expect(sent(result)[0]).toEqual({ kind: "send_text", text: "Establecimiento detectado: *Centro de Salud San Fernando*." });
  });

  it.each([
    ["tap", tap(EstablecimientoConfirmButtonId.CONFIRM)],
    ["dale", text("dale")],
    ["sí", text("sí")],
    ["confirmar", text("confirmar")],
  ])("«%s» looks for dates without a waiting text", (_label, answer) => {
    const result = handle(listed([SAN_FERNANDO]).session, answer);

    expect(result.session.state).toBe("cita_fecha_pending");
    expect(sent(result)).toEqual([]);
    expect(queries(result)).toEqual([
      expect.objectContaining({ kind: "list_fechas", payload: { codEess: "0002", especialidadId: "221900" } }),
    ]);
    expect(result.session.slots[SlotKey.CITA_COD_EESS]).toBe("0002");
    expect(result.session.slots[SlotKey.CITA_ESTABLECIMIENTO_NOMBRE]).toBe("Centro de Salud San Fernando");
    expect(result.session.slots[SlotKey.CITA_ESTABLECIMIENTO_PROPUESTO]).toBeUndefined();
  });

  it.each([
    ["tap", tap(EstablecimientoConfirmButtonId.OTHER_SEDE)],
    ["otra sede", text("otra sede")],
    ["otra", text("otra")],
    ["no", text("no")],
  ])("«%s» asks for another district", (_label, answer) => {
    const result = handle(listed([SAN_FERNANDO]).session, answer);

    expect(result.session.state).toBe("cita_awaiting_distrito_ai");
    expect(sent(result)).toEqual([
      { kind: "send_text", text: 'Perfecto. Cuéntanos en qué otro distrito buscas atención (ej. "Miraflores").' },
    ]);
    expect(result.session.slots[SlotKey.CITA_UBIGEO]).toBeUndefined();
    expect(result.session.slots[SlotKey.CITA_ESTABLECIMIENTO_PROPUESTO]).toBeUndefined();
    expect(result.session.slots[SlotKey.CITA_ESTABLECIMIENTO_PROPUESTO_NOMBRE]).toBeUndefined();
  });

  it("«salir» goes through the exit confirmation and staying asks the same question again", () => {
    const leaving = handle(listed([SAN_FERNANDO]).session, text("salir"));
    expect(leaving.session.state).toBe("cita_awaiting_exit_confirm");

    const back = handle(leaving.session, tap(ExitButtonId.NO));
    expect(back.session.state).toBe("cita_awaiting_establecimiento_confirm");
    expect(buttonsOf(back).text).toBe(CONFIRM_TEXT);
  });

  it("any other answer repeats the question", () => {
    const result = handle(listed([SAN_FERNANDO]).session, text("mañana"));

    expect(result.session.state).toBe("cita_awaiting_establecimiento_confirm");
    expect(buttonsOf(result).text).toBe(CONFIRM_TEXT);
    expect(result.session.slots[SlotKey.CITA_ESTABLECIMIENTO_PROPUESTO]).toBe("0002");
  });
});

const NO_ESTABLECIMIENTOS_TEXT =
  "No encontramos establecimientos con cupos para *Odontología General* en *San Juan de Lurigancho*. ¿Deseas buscar en otro distrito o elegir otra especialidad?";

const especialidades = {
  status: "found",
  items: [
    { codigoEspecialidad: "221900", nombreEspecialidad: "CONSULTA EXTERNA-ODONTOLOGÍA GENERAL-", cantidadCupos: 27 },
    { codigoEspecialidad: "222400", nombreEspecialidad: "CONSULTA EXTERNA-MEDICINA GENERAL-", cantidadCupos: 12 },
    { codigoEspecialidad: "220100", nombreEspecialidad: "CONSULTA EXTERNA-PEDIATRÍA-", cantidadCupos: 8 },
  ],
};

describe("sin establecimientos con cupos para la especialidad", () => {
  const none = () => listed([{ ...SAN_FERNANDO, quotasOnline: 0 }]);

  it("offers another district, another especialidad or leaving", () => {
    const result = none();

    expect(result.session.state).toBe("cita_awaiting_other_distrito");
    expect(buttonsOf(result).text).toBe(NO_ESTABLECIMIENTOS_TEXT);
    expect(buttonsOf(result).buttons).toEqual([
      { id: OtherDistritoButtonId.YES, title: "Otro distrito" },
      { id: OtherDistritoButtonId.OTHER_ESPECIALIDAD, title: "Otra especialidad" },
      { id: OtherDistritoButtonId.NO, title: "Salir" },
    ]);
    expect(findLimitViolations(buttonsOf(result))).toEqual([]);
  });

  it.each([
    ["tap", tap(OtherDistritoButtonId.OTHER_ESPECIALIDAD)],
    ["otra especialidad", text("otra especialidad")],
  ])("«%s» lists again every especialidad of the same ubigeo, the current one included", (_label, answer) => {
    const searching = handle(
      { ...none().session, counters: { [CounterKey.CITA_ESTABLECIMIENTOS_PAGE]: 2, [CounterKey.CITA_ESTABLECIMIENTOS_TOTAL_PAGES]: 2 } },
      answer,
    );

    expect(searching.session.state).toBe("cita_especialidad_pending");
    expect(sent(searching)).toEqual([]);
    expect(queries(searching)).toEqual([expect.objectContaining({ kind: "list_especialidades", payload: { ubigeo: "150132" } })]);
    expect(searching.session.slots[SlotKey.CITA_ESPECIALIDAD_ID]).toBeUndefined();
    expect(searching.session.slots[SlotKey.CITA_ESPECIALIDAD_NOMBRE]).toBeUndefined();
    expect(searching.session.slots[SlotKey.CITA_ESTABLECIMIENTOS_DESCARTADOS]).toBeUndefined();
    expect(searching.session.counters[CounterKey.CITA_ESTABLECIMIENTOS_PAGE]).toBeUndefined();
    expect(searching.session.counters[CounterKey.CITA_ESTABLECIMIENTOS_TOTAL_PAGES]).toBeUndefined();

    const offered = handle(searching.session, queryResult("list_especialidades", especialidades));
    const list = sent(offered).find((effect) => effect.kind === "send_interactive_list");
    expect(list?.kind === "send_interactive_list" && list.rows.map((row) => row.id)).toEqual(["221900", "222400", "220100"]);
    expect(searching.session.slots[SlotKey.CITA_ESPECIALIDADES_DESCARTADAS]).toBeUndefined();
  });

  it("still hides an especialidad discarded because of a duplicate cita", () => {
    const duplicated = { ...none().session, slots: { ...none().session.slots, [SlotKey.CITA_ESPECIALIDADES_DESCARTADAS]: "222400" } };
    const searching = handle(duplicated, tap(OtherDistritoButtonId.OTHER_ESPECIALIDAD));
    const offered = handle(searching.session, queryResult("list_especialidades", especialidades));

    const list = sent(offered).find((effect) => effect.kind === "send_interactive_list");
    expect(list?.kind === "send_interactive_list" && list.rows.map((row) => row.id)).toEqual(["221900", "220100"]);
  });

  it.each([
    ["tap yes", tap(OtherDistritoButtonId.YES), "cita_awaiting_distrito_ai"],
    ["otro distrito", text("otro distrito"), "cita_awaiting_distrito_ai"],
    ["tap no", tap(OtherDistritoButtonId.NO), "cita_no_coverage_closed"],
    ["salir", text("salir"), "cita_no_coverage_closed"],
  ])("«%s» goes to %s", (_label, answer, state) => {
    expect(handle(none().session, answer).session.state).toBe(state);
  });

  it("an unknown answer repeats the three options", () => {
    const result = handle(none().session, text("123"));

    expect(result.session.state).toBe("cita_awaiting_other_distrito");
    expect(buttonsOf(result).buttons.map((button) => button.id)).toEqual([
      OtherDistritoButtonId.YES,
      OtherDistritoButtonId.OTHER_ESPECIALIDAD,
      OtherDistritoButtonId.NO,
    ]);
  });

  it("the no especialidades case does not take «otra especialidad»", () => {
    const result = handle(
      { ...pending(), state: "cita_especialidad_pending" },
      queryResult("list_especialidades", { status: "found", items: [] }),
    );

    expect(handle(result.session, text("otra especialidad")).session.state).not.toBe("cita_especialidad_pending");
  });
});
