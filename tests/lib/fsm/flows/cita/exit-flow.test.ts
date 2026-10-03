import { describe, expect, it } from "vitest";
import { handle } from "@/lib/fsm/core/handlers";
import { isQueryEffect, TERMINAL_STATES } from "@/lib/fsm/core/handlers-shared";
import { serializeOffered, type OfferedList } from "@/lib/fsm/parsing/selection/selection-matchers";
import type { HandlerResult, InboundEvent, QueryResultEvent, SendEffect, Session } from "@/lib/fsm/core/types";
import { SlotKey } from "@/lib/enums/slot-key";

const FROM = "sandbox-exit";
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

const EXIT_QUESTION = {
  kind: "send_buttons",
  text: "Parece que prefieres no continuar con tu cita. Entiendo que pueda ser frustrante. ¿Deseas salir?",
  buttons: [
    { id: "cita_salir_si", title: "Sí, salir" },
    { id: "cita_salir_no", title: "No, continuar" },
  ],
};
const GOODBYE = "Entendido. Cuando quieras retomar tu cita, escríbenos. ¡Que tengas un buen día! 👋";

const especialidades: OfferedList = {
  text: "Selecciona la especialidad:",
  rows: [
    { id: "01", title: "Medicina General", description: "3 cupo(s) disponibles" },
    { id: "02", title: "Odontología", description: "2 cupo(s) disponibles" },
  ],
};

const at = (state: string, slots: Session["slots"] = {}): Session => ({
  state,
  slots: { [SlotKey.CITA_BEARER]: "token", [SlotKey.CITA_DNI]: "12345678", ...slots },
  counters: {},
});

const listState = () => at("cita_awaiting_especialidad_select", { [SlotKey.CITA_OFFERED]: serializeOffered(especialidades) });

describe("leaving the cita on purpose", () => {
  it.each([
    ["the document step", at("cita_awaiting_dni"), "quiero salir"],
    ["the district step", at("cita_awaiting_distrito_ai"), "ya no quiero nada"],
    ["a list step", listState(), "me aburrí"],
    ["the OTP step", at("cita_awaiting_otp"), "olvídalo"],
  ])("in %s a clear wish to leave asks for confirmation first", (_label, session, message) => {
    const result = handle(session, text(message));

    expect(result.session.state).toBe("cita_awaiting_exit_confirm");
    expect(result.session.slots[SlotKey.CITA_EXIT_RESUME_STATE]).toBe(session.state);
    expect(sent(result)).toEqual([EXIT_QUESTION]);
  });

  it.each([
    ["the button", tap("cita_salir_si")],
    ["«sí»", text("sí")],
    ["«salir»", text("salir")],
    ["«quiero salir»", text("quiero salir")],
  ])("confirming (%s) ends the session with a goodbye", (_label, answer) => {
    const asked = handle(listState(), text("me aburrí"));
    const result = handle(asked.session, answer);

    expect(result.session.state).toBe("cita_abandoned");
    expect(TERMINAL_STATES.has("cita_abandoned")).toBe(true);
    expect(result.session.slots).toEqual({});
    expect(sent(result)).toEqual([{ kind: "send_text", text: GOODBYE }]);
  });

  it("after leaving, the next message starts over as a first contact", () => {
    const asked = handle(listState(), text("me aburrí"));
    const left = handle(asked.session, text("sí"));
    const again = handle(left.session, text("hola"));

    expect(again.session.state).toBe("main_menu");
  });

  it.each([
    ["the button", tap("cita_salir_no")],
    ["«no»", text("no")],
    ["«continuar»", text("continuar")],
  ])("declining (%s) goes back to the list step and shows the list again", (_label, answer) => {
    const asked = handle(listState(), text("me aburrí"));
    const result = handle(asked.session, answer);

    expect(result.session.state).toBe("cita_awaiting_especialidad_select");
    expect(result.session.slots[SlotKey.CITA_EXIT_RESUME_STATE]).toBeUndefined();
    expect(sent(result)[0]).toEqual({ kind: "send_text", text: "Selecciona una opción de la lista." });
    expect(sent(result)[1]).toMatchObject({ kind: "send_interactive_list", rows: especialidades.rows });
  });

  it.each([
    ["cita_awaiting_dni", "Ingresa tu número de documento (8 dígitos)."],
    ["cita_awaiting_distrito_ai", "Cuéntanos el nombre del distrito."],
    ["cita_awaiting_departamento", "Indícanos el departamento."],
    ["cita_awaiting_provincia", "Indícanos la provincia."],
    ["cita_awaiting_distrito", "Indícanos el distrito."],
    ["cita_awaiting_otp", "Te enviamos un código a tu teléfono registrado. Escríbelo aquí (4-8 dígitos)."],
  ])("declining in %s repeats that step's question", (state, prompt) => {
    const asked = handle(at(state), text("quiero salir"));
    const result = handle(asked.session, text("no"));

    expect(result.session.state).toBe(state);
    expect(sent(result)).toEqual([{ kind: "send_text", text: prompt }]);
  });

  it("declining while waiting for the registration shows its button again", () => {
    const asked = handle(at("cita_registration_wait"), text("me aburrí"));
    const result = handle(asked.session, text("no"));

    expect(result.session.state).toBe("cita_registration_wait");
    expect(sent(result)[0]).toMatchObject({
      kind: "send_buttons",
      text: "Toca el botón para que volvamos a intentarlo, o si prefieres no continuar, dínoslo.",
    });
  });

  it("an unclear answer repeats the confirmation", () => {
    const asked = handle(listState(), text("me aburrí"));
    const result = handle(asked.session, text("asdf"));

    expect(result.session.state).toBe("cita_awaiting_exit_confirm");
    expect(sent(result)).toEqual([EXIT_QUESTION]);
  });

  it.each([
    ["other date", at("cita_awaiting_other_fecha", { [SlotKey.CITA_COD_EESS]: "1", [SlotKey.CITA_ESPECIALIDAD_ID]: "02" }), "cita_declined_closed"],
    ["other district", at("cita_awaiting_other_distrito"), "cita_no_coverage_closed"],
  ])("in the yes/no step «%s», «no» keeps its own meaning", (_label, session, closedState) => {
    const result = handle(session, text("no"));

    expect(result.session.state).toBe(closedState);
  });

  it("in a yes/no step even «quiero salir» is not intercepted", () => {
    const result = handle(at("cita_awaiting_hora_confirm", { [SlotKey.CITA_HORA_CONFIRM_ID]: "08:00|08:15" }), text("quiero salir"));

    expect(result.session.state).not.toBe("cita_awaiting_exit_confirm");
  });

  it("«no» alone in the document step is still just an invalid document", () => {
    const result = handle(at("cita_awaiting_dni"), text("no"));

    expect(result.session.state).toBe("cita_awaiting_dni");
    expect(sent(result)).toEqual([{ kind: "send_text", text: "Documento inválido. Debe tener 8 dígitos. Intenta de nuevo." }]);
  });

  it("a district name is never taken as a wish to leave", () => {
    const result = handle(at("cita_awaiting_distrito_ai"), text("Miraflores"));

    expect(result.session.state).not.toBe("cita_awaiting_exit_confirm");
  });
});

describe("the AI noticing a wish to leave", () => {
  it("in the district search asks for confirmation and would come back to the district question", () => {
    const pending = at("cita_distrito_ai_pending");
    const result = handle(pending, queryResult("resolve_distrito_ai", { outcome: "not_found", candidates: [], quiereSalir: true }));

    expect(result.session.state).toBe("cita_awaiting_exit_confirm");
    expect(result.session.slots[SlotKey.CITA_EXIT_RESUME_STATE]).toBe("cita_awaiting_distrito_ai");
    expect(sent(result)).toEqual([EXIT_QUESTION]);
  });

  it("in the selection hints asks for confirmation and would come back to the list", () => {
    const pending = at("cita_selection_hints_pending", {
      [SlotKey.CITA_SELECTION_STEP]: "especialidad",
      [SlotKey.CITA_OFFERED]: serializeOffered(especialidades),
    });
    const result = handle(pending, queryResult("extract_selection_hints", { quiereSalir: true }));

    expect(result.session.state).toBe("cita_awaiting_exit_confirm");
    expect(result.session.slots[SlotKey.CITA_EXIT_RESUME_STATE]).toBe("cita_awaiting_especialidad_select");
  });

  it("in the date phrase asks for confirmation and would come back to the dates", () => {
    const pending = at("cita_fecha_ai_pending", {
      [SlotKey.CITA_OFFERED]: serializeOffered({ text: "Selecciona la fecha:", rows: [{ id: "22/09/2099", title: "mar 22 sep" }] }),
    });
    const result = handle(pending, queryResult("resolve_fecha_ai", { quiereSalir: true }));

    expect(result.session.state).toBe("cita_awaiting_exit_confirm");
    expect(result.session.slots[SlotKey.CITA_EXIT_RESUME_STATE]).toBe("cita_awaiting_fecha_select");
  });
});
