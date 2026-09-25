import { describe, expect, it } from "vitest";
import { EMERGENCY_CLOSED_STATE } from "@/lib/fsm/flows/emergency/emergency";
import { handleFirstContact } from "@/lib/fsm/routing/first-contact";
import { handle } from "@/lib/fsm/core/handlers";
import { isQueryEffect, TERMINAL_STATES } from "@/lib/fsm/core/handlers-shared";
import { IN_FLOW_MAX_CHARS, isEmergency, isEmergencyInFlow } from "@/lib/fsm/flows/out-of-scope/out-of-scope";
import { OOS_MESSAGES } from "@/lib/fsm/flows/out-of-scope/out-of-scope-messages";
import type { HandlerResult, InboundEvent, QueryResultEvent, SendEffect, Session } from "@/lib/fsm/core/types";

// A medical emergency (chest pain, heart attack, suffocation, "me muero"…) ends the
// conversation, wherever it is typed: ONE message with the official numbers and the
// advice to go to the nearest health facility, and nothing else. The bot does not
// assist, diagnose or keep a flow open, and leaves no pending step in the FSM.

const FROM = "sandbox-emergency-cut";
const text = (value: string): InboundEvent => ({ from: FROM, type: "text", text: value });
const at = (state: string, slots: Session["slots"] = {}): Session => ({ state, slots, counters: {} });

const sent = (result: HandlerResult): SendEffect[] => result.effects.filter((effect): effect is SendEffect => !isQueryEffect(effect));
const queries = (result: HandlerResult) => result.effects.filter(isQueryEffect);
const oosNote = (result: HandlerResult) => result.notes?.find((note) => note.kind === "out_of_scope");

const CUT = { kind: "send_text", text: OOS_MESSAGES["OOS-01"] };
const CLOSED = { state: EMERGENCY_CLOSED_STATE, slots: {}, counters: {} };
const EMERGENCY = "mi hijo no respira";

// Every place the citizen can be when they type it: the menu, after a finished flow
// and each step of the Cita and Reclamo flows (with what those steps already hold).
const STATES: Array<[string, Session["slots"]]> = [
  ["main_menu", {}],
  ["cita_booked", { citaDni: "12345678" }],
  ["cita_awaiting_dni", {}],
  ["cita_awaiting_otp", { citaTwofaId: "t", citaDni: "12345678" }],
  ["cita_awaiting_distrito_ai", { citaBearer: "token", citaDni: "12345678" }],
  ["cita_awaiting_hora_confirm", { citaBearer: "token", citaDni: "12345678", citaHoraConfirmId: "13:00|13:30", citaHoraConfirmOnly: "1" }],
  ["cita_awaiting_other_fecha", { citaBearer: "token", citaDni: "12345678", citaCodEess: "1", citaEspecialidadId: "02" }],
  ["cita_awaiting_reauth", { citaDni: "12345678" }],
  ["reclamo_awaiting_dni", {}],
  ["reclamo_awaiting_descripcion", { reclamoDni: "12345678" }],
];

describe("a medical emergency ends the conversation cleanly, wherever it is typed", () => {
  it.each(STATES)("%s: one message, the session is closed and nothing is left pending", (state, slots) => {
    const result = handle(at(state, slots), text(EMERGENCY));

    expect(sent(result)).toEqual([CUT]);
    expect(queries(result)).toHaveLength(0);
    expect(result.session).toEqual(CLOSED);
  });

  it.each(STATES)("%s: it is logged as a warning that closed the session", (state, slots) => {
    expect(oosNote(handle(at(state, slots), text(EMERGENCY)))).toMatchObject({
      level: "warn",
      detail: { category: "OOS-01", state, closed: true },
    });
  });

  it("as the very first message of a conversation", () => {
    const result = handleFirstContact(EMERGENCY);

    expect(sent(result)).toEqual([CUT]);
    expect(queries(result)).toHaveLength(0);
    expect(result.session).toEqual(CLOSED);
    expect(oosNote(result)).toMatchObject({ level: "warn", detail: { category: "OOS-01", closed: true } });
  });

  it("with an expired session the citizen still gets the numbers, not the re-verification question", () => {
    const stale: Session = { ...at("cita_awaiting_hora_confirm", { citaBearer: "token", citaDni: "12345678" }), updatedAt: new Date(0) };
    const result = handle(stale, text(EMERGENCY), 60 * 60 * 1000);

    expect(sent(result)).toEqual([CUT]);
    expect(result.session).toEqual(CLOSED);
  });

  it("the verification the citizen had is gone with the session", () => {
    const result = handle(at("cita_awaiting_hora_confirm", { citaBearer: "token", citaDni: "12345678" }), text(EMERGENCY));

    expect(result.session.slots).toEqual({});
  });
});

describe("the message: official channels and go to a health facility, nothing else", () => {
  const message = OOS_MESSAGES["OOS-01"];

  it("names SAMU 106 and Bomberos 116, both free, and the nearest health facility", () => {
    expect(message).toContain("SAMU: 106 (ambulancias y emergencias médicas)");
    expect(message).toContain("Bomberos: 116 (rescate y urgencias)");
    expect(message).toContain("llamadas gratuitas");
    expect(message).toContain("establecimiento de salud más cercano");
  });

  it("does not invite the citizen to go on, and gives no medical advice", () => {
    expect(message).not.toMatch(/CONTINUAR|CITAS|RECLAMO|escriba|escribe/i);
    expect(message).not.toMatch(/tome|tomar|recomend|diagn|síntoma|sintoma/i);
  });

  it("is short enough to read in a moment of panic", () => {
    expect(message.length).toBeLessThan(500);
  });
});

describe("it comes before everything else the citizen wrote", () => {
  it.each([
    ["an insult", "ustedes son unos idiotas, mi mamá no puede respirar"],
    ["a request for a cita", "quiero una cita de cardiología, tengo dolor de pecho"],
    ["a request to complain", "quiero hacer un reclamo, mi papá se está asfixiando"],
  ])("at the menu: %s", (_label, message) => {
    const result = handle(at("main_menu"), text(message));

    expect(sent(result)).toEqual([CUT]);
    expect(result.session).toEqual(CLOSED);
  });

  it("inside a flow: an insult does not get the warning first", () => {
    const result = handle(at("cita_awaiting_dni"), text("idiotas, mi hijo no respira"));

    expect(sent(result)).toEqual([CUT]);
    expect(result.session).toEqual(CLOSED);
  });
});

describe("the conversation can start again after the cut", () => {
  it("the closed state is terminal", () => {
    expect(TERMINAL_STATES.has(EMERGENCY_CLOSED_STATE)).toBe(true);
  });

  it("a greeting afterwards gets the welcome, as after any finished flow", () => {
    const closed = handle(at("cita_awaiting_dni"), text(EMERGENCY)).session;

    const next = handle(closed, text("Hola"));

    expect(sent(next)[0]).toMatchObject({ kind: "send_cta_url" });
    expect(next.session.state).toBe("main_menu");
  });

  it("a request for a cita afterwards goes straight into the Cita flow", () => {
    const closed = handle(at("cita_awaiting_dni"), text(EMERGENCY)).session;

    expect(handle(closed, text("quiero una cita de odontología en Miraflores")).session.state).toBe("cita_awaiting_dni");
  });

  it("a second emergency is cut again", () => {
    const closed = handle(at("cita_awaiting_dni"), text(EMERGENCY)).session;

    expect(handle(closed, text("por favor, mi hijo sigue sin respirar")).session).toEqual(CLOSED);
  });
});

describe("what counts as an emergency", () => {
  it.each([
    "dolor de pecho",
    "tengo un dolor de pecho muy fuerte",
    "me duele el pecho",
    "creo que es un infarto",
    "mi abuelo sufre un infarto",
    "se está asfixiando",
    "mi bebé se asfixia",
    "tengo asfixia",
    "me muero",
    "ayuda, me muero",
    "me estoy muriendo",
    "me muero de dolor",
    "mi mamá no puede respirar",
    "mi hijo sigue sin respirar",
    "dejó de respirar",
    "me falta el aire",
  ])("%j is", (message) => {
    expect(isEmergency(message), message).toBe(true);
    expect(handle(at("main_menu"), text(message)).session, message).toEqual(CLOSED);
  });

  it.each([
    "me muero de risa",
    "me muero de ganas de que me atiendan",
    "me muero de hambre",
    "me muero de vergüenza",
    "me muero por una cita",
    "quiero una cita",
    "el doctor me atendió muy mal",
  ])("%j is not", (message) => {
    expect(isEmergency(message), message).toBe(false);
  });
});

describe("inside a flow only a short text is read as an emergency", () => {
  const padded = (length: number) => "mi hijo no respira ".padEnd(length, "x");

  it("up to 120 characters is read, longer is a narrative", () => {
    expect(IN_FLOW_MAX_CHARS).toBe(120);
    expect(isEmergencyInFlow(padded(IN_FLOW_MAX_CHARS))).toBe(true);
    expect(isEmergencyInFlow(padded(IN_FLOW_MAX_CHARS + 1))).toBe(false);
  });

  it("a long complaint that mentions an ambulance is evidence: the flow goes on and nothing is closed", () => {
    const narrative =
      "El dia martes esperamos mas de tres horas una ambulancia que nunca llego al centro de salud, el personal no supo explicar por que y nadie se hizo responsable de la demora en la atencion de mi familiar";
    expect(narrative.length).toBeGreaterThan(IN_FLOW_MAX_CHARS);

    const result = handle(at("reclamo_awaiting_descripcion", { reclamoDni: "12345678" }), text(narrative));

    expect(sent(result)[0]).not.toEqual(CUT);
    expect(oosNote(result)).toBeUndefined();
    expect(result.session.state).toBe("reclamo_awaiting_foto");
    expect(result.session.slots.queja).toBe(narrative);
  });

  it("at the menu there is no length limit: the citizen is not in the middle of anything", () => {
    const long = `${"Buenas tardes, necesito ayuda urgente. ".repeat(5)}mi papá tiene dolor de pecho`;
    expect(long.length).toBeGreaterThan(IN_FLOW_MAX_CHARS);

    expect(handle(at("main_menu"), text(long)).session).toEqual(CLOSED);
  });

  it("an ordinary answer in a flow is not touched", () => {
    const result = handle(at("cita_awaiting_dni"), text("hola buenas tardes"));

    expect(sent(result)[0]).not.toEqual(CUT);
    expect(result.session.state).toBe("cita_awaiting_dni");
  });
});

describe("only typed text is read", () => {
  it("a tap is never taken for an emergency", () => {
    const result = handle(at("cita_awaiting_hora_confirm", { citaBearer: "token", citaHoraConfirmId: "13:00|13:30" }), { from: FROM, type: "button", listId: "hora_confirm_no" });

    expect(oosNote(result)).toBeUndefined();
  });

  it("neither is the result of a query", () => {
    const result: QueryResultEvent = { from: FROM, type: "query_result", queryKind: "list_fechas", result: { status: "error" } };

    expect(oosNote(handle(at("cita_fecha_pending", { citaBearer: "token" }), result))).toBeUndefined();
  });
});
