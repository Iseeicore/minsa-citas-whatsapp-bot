import { describe, expect, it } from "vitest";
import { handle } from "./handlers";
import { isQueryEffect } from "./handlers-shared";
import { IN_FLOW_MAX_CHARS, isEmergencyInFlow } from "./out-of-scope";
import { EMERGENCY_IN_FLOW_TEXT, OOS_MESSAGES } from "./out-of-scope-messages";
import type { HandlerResult, InboundEvent, QueryResultEvent, SendEffect, Session } from "./types";

// A medical emergency typed INSIDE a flow (DNI, OTP, district, complaint…) used to
// be read by that step as a wrong answer and the citizen never saw the number to
// call. Now the notice goes first and the step goes on exactly as before, so
// nothing the citizen had already given is lost.

const FROM = "sandbox-emergency-flow";
const text = (value: string): InboundEvent => ({ from: FROM, type: "text", text: value });
const at = (state: string, slots: Session["slots"] = {}): Session => ({ state, slots, counters: {} });

const sent = (result: HandlerResult): SendEffect[] => result.effects.filter((effect): effect is SendEffect => !isQueryEffect(effect));
const noticeNote = (result: HandlerResult) => result.notes?.find((note) => note.kind === "out_of_scope");
const NOTICE = { kind: "send_text", text: EMERGENCY_IN_FLOW_TEXT };

const EMERGENCY = "mi hijo no respira";

// States where the citizen types free text, and the step's own reply to that text.
const FLOW_STATES: Array<[string, Session["slots"]]> = [
  ["cita_awaiting_dni", {}],
  ["cita_awaiting_otp", { citaTwofaId: "t", citaDni: "12345678" }],
  ["cita_awaiting_distrito_ai", { citaBearer: "token", citaDni: "12345678" }],
  ["cita_awaiting_hora_confirm", { citaBearer: "token", citaDni: "12345678", citaHoraConfirmId: "13:00|13:30", citaHoraConfirmOnly: "1" }],
  ["cita_awaiting_other_fecha", { citaBearer: "token", citaDni: "12345678", citaCodEess: "1", citaEspecialidadId: "02" }],
  ["reclamo_awaiting_dni", {}],
  ["reclamo_awaiting_descripcion", { reclamoDni: "12345678" }],
];

describe("an emergency typed inside a flow shows the number to call first", () => {
  it.each(FLOW_STATES)("%s: the notice comes first and names SAMU 106 and Bomberos 116", (state, slots) => {
    const result = handle(at(state, slots), text(EMERGENCY));

    expect(sent(result)[0]).toEqual(NOTICE);
    expect(EMERGENCY_IN_FLOW_TEXT).toContain("SAMU: 106");
    expect(EMERGENCY_IN_FLOW_TEXT).toContain("Bomberos: 116");
  });

  it.each(FLOW_STATES)("%s: it is logged as a warning, marked as inside a flow", (state, slots) => {
    const note = noticeNote(handle(at(state, slots), text(EMERGENCY)));

    expect(note).toMatchObject({ level: "warn", detail: { category: "OOS-01", inFlow: true, state } });
  });

  it("the step goes on as before: the DNI step still asks for a DNI, and the state does not change", () => {
    const result = handle(at("cita_awaiting_dni"), text(EMERGENCY));

    expect(result.session.state).toBe("cita_awaiting_dni");
    expect(sent(result)[1]).toMatchObject({ text: expect.stringContaining("DNI inválido") });
  });

  it("typing it at the OTP step does not use up one of the three attempts", () => {
    const session = at("cita_awaiting_otp", { citaTwofaId: "t", citaDni: "12345678" });
    const result = handle(session, text(EMERGENCY));

    expect(result.session.state).toBe("cita_awaiting_otp");
    expect(result.session.counters).toEqual(session.counters);
    expect(result.effects.filter(isQueryEffect)).toHaveLength(0);
  });

  it("what the citizen already gave is kept (verification, choices)", () => {
    const slots = { citaBearer: "token", citaDni: "12345678", citaHoraConfirmId: "13:00|13:30", citaHoraConfirmOnly: "1" };
    const result = handle(at("cita_awaiting_hora_confirm", slots), text(EMERGENCY));

    expect(result.session.state).toBe("cita_awaiting_hora_confirm");
    expect(result.session.slots).toMatchObject({ citaBearer: "token", citaDni: "12345678", citaHoraConfirmId: "13:00|13:30" });
  });

  it("a complaint description that is a short emergency is still taken as the description", () => {
    const result = handle(at("reclamo_awaiting_descripcion", { reclamoDni: "12345678" }), text(EMERGENCY));

    expect(sent(result)[0]).toEqual(NOTICE);
    expect(result.session.state).toBe("reclamo_awaiting_foto");
    expect(result.session.slots.queja).toBe(EMERGENCY);
  });

  it("the notice does not tell the citizen to type CONTINUAR: the flow is still open", () => {
    expect(EMERGENCY_IN_FLOW_TEXT).not.toMatch(/CONTINUAR|CITAS|RECLAMO/);
    expect(EMERGENCY_IN_FLOW_TEXT.length).toBeLessThan(400);
  });

  it("it also goes first when the citizen insults", () => {
    const result = handle(at("cita_awaiting_dni"), text("idiotas, mi hijo no respira"));

    expect(sent(result)[0]).toEqual(NOTICE);
    expect(sent(result).length).toBeGreaterThan(1);
  });

  it("with an expired session the notice goes first and the re-verification question follows", () => {
    const stale: Session = { ...at("cita_awaiting_hora_confirm", { citaBearer: "token", citaDni: "12345678" }), updatedAt: new Date(0) };
    const result = handle(stale, text(EMERGENCY), 60 * 60 * 1000);

    expect(sent(result)[0]).toEqual(NOTICE);
    expect(result.session.state).toBe("cita_awaiting_reauth");
  });

  it("while waiting for the re-verification answer, the notice goes first too", () => {
    const result = handle(at("cita_awaiting_reauth", { citaDni: "12345678" }), text(EMERGENCY));

    expect(sent(result)[0]).toEqual(NOTICE);
    expect(result.session.state).toBe("cita_awaiting_reauth");
  });
});

describe("what is NOT an emergency inside a flow is left alone", () => {
  it.each(FLOW_STATES)("%s: an ordinary answer gets no notice", (state, slots) => {
    const result = handle(at(state, slots), text("hola buenas tardes"));

    expect(sent(result)[0]).not.toEqual(NOTICE);
    expect(noticeNote(result)).toBeUndefined();
  });

  it("a long complaint narrative that mentions an ambulance is evidence, not an alarm", () => {
    const narrative =
      "El dia martes esperamos mas de tres horas una ambulancia que nunca llego al centro de salud, el personal no supo explicar por que y nadie se hizo responsable de la demora en la atencion de mi familiar";
    expect(narrative.length).toBeGreaterThan(120);

    const result = handle(at("reclamo_awaiting_descripcion", { reclamoDni: "12345678" }), text(narrative));

    expect(sent(result)[0]).not.toEqual(NOTICE);
    expect(noticeNote(result)).toBeUndefined();
    expect(result.session.state).toBe("reclamo_awaiting_foto");
    expect(result.session.slots.queja).toBe(narrative);
  });

  it("a tap or a query result is never read as an emergency", () => {
    const tapped = handle(at("cita_awaiting_hora_confirm", { citaBearer: "token", citaHoraConfirmId: "13:00|13:30" }), { from: FROM, type: "button", listId: "hora_confirm_no" });
    expect(noticeNote(tapped)).toBeUndefined();

    const result: QueryResultEvent = { from: FROM, type: "query_result", queryKind: "list_fechas", result: { status: "error" } };
    expect(noticeNote(handle(at("cita_fecha_pending", { citaBearer: "token" }), result))).toBeUndefined();
  });
});

describe("at the menu nothing changes: the full emergency message replaces the reply", () => {
  it("main menu", () => {
    const result = handle(at("main_menu"), text(EMERGENCY));

    expect(sent(result)).toEqual([{ kind: "send_text", text: OOS_MESSAGES["OOS-01"] }]);
    expect(noticeNote(result)?.detail).toEqual({ category: "OOS-01" });
  });

  it("after a finished flow", () => {
    const result = handle(at("cita_booked", { citaDni: "12345678" }), text(EMERGENCY));

    expect(sent(result)).toEqual([{ kind: "send_text", text: OOS_MESSAGES["OOS-01"] }]);
  });
});

describe("isEmergencyInFlow: short texts only", () => {
  const padded = (length: number) => "mi hijo no respira ".padEnd(length, "x");

  it("reads a text up to the limit and leaves a longer one alone", () => {
    expect(IN_FLOW_MAX_CHARS).toBe(120);
    expect(isEmergencyInFlow(padded(IN_FLOW_MAX_CHARS))).toBe(true);
    expect(isEmergencyInFlow(padded(IN_FLOW_MAX_CHARS + 1))).toBe(false);
  });

  it("is false for anything that is not an emergency", () => {
    expect(isEmergencyInFlow("12345678")).toBe(false);
    expect(isEmergencyInFlow("San Juan de Lurigancho")).toBe(false);
    expect(isEmergencyInFlow("")).toBe(false);
  });
});
