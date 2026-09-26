import { describe, expect, it } from "vitest";
import { handle } from "@/lib/fsm/core/handlers";
import { isQueryEffect } from "@/lib/fsm/core/handlers-shared";
import { serializeOffered } from "@/lib/fsm/parsing/selection-matchers";
import type { HandlerResult, InboundEvent, QueryResultEvent, SendEffect, Session } from "@/lib/fsm/core/types";

const FROM = "sandbox-duplicate";
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

function booking(extra: Session["slots"] = {}): Session {
  return {
    state: "cita_booking_pending",
    slots: {
      citaBearer: "token",
      citaDni: "12345678",
      citaUbigeo: "150132",
      citaEspecialidadId: "E1",
      citaEspecialidadNombre: "Pediatría",
      citaCodEess: "0000123",
      citaFecha: "31/12/2099",
      ...extra,
    },
    counters: {},
  };
}

const duplicate = (session: Session = booking()) =>
  handle(session, queryResult("book_appointment", { status: "duplicate", message: "Ya tiene una cita activa" }));

describe("a duplicate booking means one active cita per especialidad", () => {
  it("asks whether to try another especialidad, naming the one that is taken", () => {
    const result = duplicate();

    expect(result.session.state).toBe("cita_awaiting_duplicate_choice");
    expect(result.session.slots.citaEspecialidadesDescartadas).toBe("E1");
    expect(sent(result)).toEqual([
      {
        kind: "send_buttons",
        text: "Ya tienes una cita activa para *Pediatría*. El MINSA permite una sola cita activa por especialidad. ¿Deseas intentar con otra especialidad?",
        buttons: [
          { id: "cita_duplicada_otra_especialidad", title: "Sí, otra especialidad" },
          { id: "cita_duplicada_salir", title: "No, salir" },
        ],
      },
    ]);
  });

  it("without a stored name it still asks, without inventing one", () => {
    const result = duplicate(booking({ citaEspecialidadNombre: undefined as unknown as string }));

    expect(sent(result)[0]).toMatchObject({
      text: "Ya tienes una cita activa para esa especialidad. El MINSA permite una sola cita activa por especialidad. ¿Deseas intentar con otra especialidad?",
    });
  });

  it.each([
    ["the button", tap("cita_duplicada_otra_especialidad")],
    ["«sí»", text("sí")],
    ["«otra especialidad»", text("otra especialidad")],
    ["«cambiar»", text("cambiar")],
  ])("yes (%s) lists the especialidades again", (_label, answer) => {
    const result = handle(duplicate().session, answer);

    expect(result.session.state).toBe("cita_especialidad_pending");
    expect(sent(result)).toEqual([{ kind: "send_text", text: "Buscando otras especialidades disponibles…" }]);
    expect(queries(result)).toEqual([{ kind: "list_especialidades", payload: { ubigeo: "150132" } }]);
  });

  it.each([
    ["the button", tap("cita_duplicada_salir")],
    ["«no»", text("no")],
    ["«salir»", text("salir")],
  ])("no (%s) ends the session with a goodbye", (_label, answer) => {
    const result = handle(duplicate().session, answer);

    expect(result.session.state).toBe("cita_booking_duplicate");
    expect(result.session.slots).toEqual({});
    expect(sent(result)).toEqual([{ kind: "send_text", text: FAREWELL }]);
  });

  it("an unknown answer asks again and keeps the state", () => {
    const asked = duplicate().session;
    const result = handle(asked, text("mmm no sé"));

    expect(result.session.state).toBe("cita_awaiting_duplicate_choice");
    expect(sent(result)[0]).toMatchObject({ kind: "send_buttons" });
  });

  it("the new list leaves out the especialidad that already has an active cita", () => {
    const listing = handle(duplicate().session, text("sí")).session;
    const result = handle(
      listing,
      queryResult("list_especialidades", {
        status: "found",
        items: [
          { codigoEspecialidad: "E1", nombreEspecialidad: "Pediatría", cantidadCupos: 3 },
          { codigoEspecialidad: "E2", nombreEspecialidad: "Cardiología", cantidadCupos: 1 },
        ],
      }),
    );

    expect(result.session.state).toBe("cita_awaiting_especialidad_select");
    const list = sent(result)[0] as { sections?: Array<{ rows: Array<{ id: string }> }>; rows?: Array<{ id: string }> };
    const ids = (list.rows ?? list.sections?.flatMap((section) => section.rows) ?? []).map((row) => row.id);
    expect(ids).toEqual(["E2"]);
  });

  it("if that was the only especialidad, it offers another district instead of an empty list", () => {
    const listing = handle(duplicate().session, text("sí")).session;
    const result = handle(
      listing,
      queryResult("list_especialidades", {
        status: "found",
        items: [{ codigoEspecialidad: "E1", nombreEspecialidad: "Pediatría", cantidadCupos: 3 }],
      }),
    );

    expect(result.session.state).toBe("cita_awaiting_other_distrito");
  });
});

describe("the chosen especialidad keeps its name for later messages", () => {
  it("picking from the list stores the name", () => {
    const session: Session = {
      state: "cita_awaiting_especialidad_select",
      slots: {
        citaBearer: "token",
        citaUbigeo: "150132",
        citaOffered: serializeOffered({
          text: "Selecciona la especialidad:",
          rows: [
            { id: "E1", title: "Pediatría" },
            { id: "E2", title: "Cardiología" },
          ],
        }),
      },
      counters: {},
    };

    const result = handle(session, { from: FROM, type: "list", listId: "E2" });

    expect(result.session.slots.citaEspecialidadNombre).toBe("Cardiología");
  });
});
