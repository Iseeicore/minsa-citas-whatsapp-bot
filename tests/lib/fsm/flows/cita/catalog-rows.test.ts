import { describe, expect, it } from "vitest";
import { handle } from "@/lib/fsm/core/handlers";
import { isQueryEffect } from "@/lib/fsm/core/handlers-shared";
import type { HandlerResult, InboundEvent, QueryResultEvent, SendEffect, Session } from "@/lib/fsm/core/types";
import { SlotKey } from "@/lib/enums/slot-key";

const FROM = "sandbox-catalog-rows";
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
const listOf = (result: HandlerResult) => {
  const list = sent(result).find((effect) => effect.kind === "send_interactive_list");
  if (!list || list.kind !== "send_interactive_list") throw new Error("no list sent");
  return list;
};

const pending = (state: Session["state"], slots: Session["slots"] = {}): Session => ({
  state,
  slots: { [SlotKey.CITA_BEARER]: "token", [SlotKey.CITA_DNI]: "12345678", [SlotKey.CITA_UBIGEO]: "150132", ...slots },
  counters: {},
});

const especialidades = {
  status: "found",
  items: [
    { codigoEspecialidad: "222400", nombreEspecialidad: "CONSULTA EXTERNA-MEDICINA GENERAL / ATENCIÓN DEL ADULTO-", cantidadCupos: 1312 },
    { codigoEspecialidad: "221900", nombreEspecialidad: "CONSULTA EXTERNA-ODONTOLOGÍA GENERAL-", cantidadCupos: 27 },
  ],
};

const establecimientos = {
  status: "found",
  items: [
    { renipressCode: "0001", establishmentName: "HOSPITAL NACIONAL HIPOLITO UNANUE", quotasOnline: 12 },
    { renipressCode: "0002", establishmentName: "CENTRO DE SALUD SAN FERNANDO", quotasOnline: 3 },
  ],
};

describe("especialidad rows are readable", () => {
  it("shows the short name as title and the full name with quotas as description", () => {
    const result = handle(pending("cita_especialidad_pending"), queryResult("list_especialidades", especialidades));

    const rows = listOf(result).rows;
    expect(rows).toEqual([
      { id: "222400", title: "Medicina General", description: "Medicina General / Atención del Adulto · 1312 cupos" },
      { id: "221900", title: "Odontología General", description: "27 cupos" },
    ]);
  });

  it("typing part of the full name picks the row, and the full name is stored", () => {
    const listed = handle(pending("cita_especialidad_pending"), queryResult("list_especialidades", especialidades));
    const result = handle(listed.session, text("atención del adulto"));

    expect(result.session.state).toBe("cita_establecimiento_pending");
    expect(result.session.slots[SlotKey.CITA_ESPECIALIDAD_ID]).toBe("222400");
    expect(result.session.slots[SlotKey.CITA_ESPECIALIDAD_NOMBRE]).toBe("Medicina General / Atención del Adulto");
  });

  it("a hint-detected especialidad is announced with its clean name", () => {
    const result = handle(
      pending("cita_especialidad_pending", { [SlotKey.CITA_ESPECIALIDAD_HINT_TEXT]: "odontologia" }),
      queryResult("list_especialidades", especialidades),
    );

    expect(sent(result)[0]).toEqual({ kind: "send_text", text: "Especialidad detectada: Odontología General. Buscando establecimientos…" });
    expect(result.session.slots[SlotKey.CITA_ESPECIALIDAD_NOMBRE]).toBe("Odontología General");
  });
});

describe("establecimiento rows are readable", () => {
  it("abbreviates the title and keeps the full name in the description", () => {
    const result = handle(
      pending("cita_establecimiento_pending", { [SlotKey.CITA_ESPECIALIDAD_ID]: "222400" }),
      queryResult("list_establecimientos", establecimientos),
    );

    const rows = listOf(result).rows;
    expect(rows).toEqual([
      { id: "0001", title: "Hosp. Nacional Hipolito", description: "Hospital Nacional Hipolito Unanue · 12 cupos" },
      { id: "0002", title: "C.S. San Fernando", description: "Centro de Salud San Fernando · 3 cupos" },
    ]);
  });

  it("stores the full name of the picked establecimiento", () => {
    const listed = handle(
      pending("cita_establecimiento_pending", { [SlotKey.CITA_ESPECIALIDAD_ID]: "222400" }),
      queryResult("list_establecimientos", establecimientos),
    );
    const result = handle(listed.session, tap("0002"));

    expect(result.session.state).toBe("cita_fecha_pending");
    expect(result.session.slots[SlotKey.CITA_ESTABLECIMIENTO_NOMBRE]).toBe("Centro de Salud San Fernando");
  });

  it("a single establecimiento is announced with its clean name", () => {
    const result = handle(
      pending("cita_establecimiento_pending", { [SlotKey.CITA_ESPECIALIDAD_ID]: "222400" }),
      queryResult("list_establecimientos", { status: "found", items: [establecimientos.items[1]] }),
    );

    expect(sent(result)[0]).toEqual({
      kind: "send_text",
      text: "Establecimiento encontrado: Centro de Salud San Fernando. Buscando fechas disponibles…",
    });
  });
});
