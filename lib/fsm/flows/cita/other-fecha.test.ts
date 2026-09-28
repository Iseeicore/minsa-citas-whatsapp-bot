import { describe, expect, it } from "vitest";
import { offerOtherFecha } from "@/lib/fsm/flows/cita/steps/other-fecha";
import { handle } from "@/lib/fsm/core/handlers";
import { isQueryEffect, TERMINAL_STATES } from "@/lib/fsm/core/handlers-shared";
import { AUTHENTICATED_WAITING_STATES, resumeStateFor } from "@/lib/fsm/session/session-expiry-guard";
import type { HandlerResult, InboundEvent, QueryResultEvent, SendEffect, Session } from "@/lib/fsm/core/types";

const FROM = "sandbox-other-fecha";
const text = (value: string): InboundEvent => ({ from: FROM, type: "text", text: value });
const tap = (id: string): InboundEvent => ({ from: FROM, type: "button", listId: id });
const fechasResult = (fechas: string[]): QueryResultEvent => ({
  from: FROM,
  type: "query_result",
  queryKind: "list_fechas",
  result: { status: "found", items: fechas.map((fechaCupo) => ({ fechaCupo, cantidadCupos: 2 })) },
});
const horasResult = (items: Array<{ horaInicio: string; horaFin: string }>): QueryResultEvent => ({
  from: FROM,
  type: "query_result",
  queryKind: "list_horas",
  result: { status: "found", items: items.map((item) => ({ ...item, cantidadCupos: 1 })) },
});

const queries = (result: HandlerResult) => result.effects.filter(isQueryEffect);
const sent = (result: HandlerResult): SendEffect[] =>
  result.effects.filter((effect): effect is SendEffect => !isQueryEffect(effect));
const noteOf = (result: HandlerResult, kind: string) => result.notes?.find((note) => note.kind === kind);

const DAY_1 = "31/12/2099";
const DAY_2 = "01/01/2100";
const DAY_3 = "02/01/2100";

const BASE_SLOTS = {
  citaBearer: "token",
  citaCodEess: "0000123",
  citaEspecialidadId: "02",
  citaFecha: DAY_1,
  citaDni: "12345678",
  citaDistrito: "MIRAFLORES",
};

const confirmingLone = (extra: Session["slots"] = {}): Session => ({
  state: "cita_awaiting_hora_confirm",
  slots: { ...BASE_SLOTS, citaHoraConfirmId: "13:00|13:30", citaHoraConfirmOnly: "1", ...extra },
  counters: {},
});

const askedForAnotherDate = (extra: Session["slots"] = {}) => handle(confirmingLone(extra), tap("hora_confirm_no")).session;

describe("declining the only horario offers another date instead of closing", () => {
  it.each([
    ["the button", tap("hora_confirm_no")],
    ["typed no", text("no")],
    ["typed «otro horario»", text("otro horario")],
    ["typed «no, gracias»", text("no, gracias")],
  ])("%s asks whether the citizen wants another date", (_label, event) => {
    const result = handle(confirmingLone(), event);

    expect(result.session.state).toBe("cita_awaiting_other_fecha");
    expect(queries(result)).toHaveLength(0);
    expect(sent(result)).toHaveLength(1);
    expect(sent(result)[0]).toMatchObject({
      kind: "send_buttons",
      text: expect.stringContaining("¿Deseas cambiar de fecha?"),
    });
    expect((sent(result)[0] as { buttons: Array<{ id: string }> }).buttons.map((button) => button.id)).toEqual([
      "cita_otra_fecha_si",
      "cita_otra_fecha_no",
    ]);
  });

  it("says why: it was the only horario, so another date is the recommendation", () => {
    const [message] = sent(handle(confirmingLone(), tap("hora_confirm_no")));

    expect(message).toMatchObject({ text: expect.stringContaining("único horario") });
    expect(message).toMatchObject({ text: expect.stringContaining("[1] Sí, cambiar de fecha") });
    expect(message).toMatchObject({ text: expect.stringContaining("[2] No, salir") });
  });

  it("keeps the verification and the choices, forgets the date and the pending horario", () => {
    const { slots } = askedForAnotherDate();

    expect(slots).toMatchObject({ citaBearer: "token", citaDni: "12345678", citaCodEess: "0000123", citaEspecialidadId: "02" });
    expect(slots.citaFecha).toBeUndefined();
    expect(slots.citaHoraConfirmId).toBeUndefined();
    expect(slots.citaHoraConfirmOnly).toBeUndefined();
  });

  it("remembers the date that was declined", () => {
    expect(askedForAnotherDate().slots.citaFechasDescartadas).toBe(DAY_1);
  });

  it("logs it as hora_declined", () => {
    expect(noteOf(handle(confirmingLone(), tap("hora_confirm_no")), "hora_declined")).toMatchObject({
      detail: { step: "hora_confirm", only: true },
    });
  });

  it("with a previous page's list still there, the citizen goes back to it as before", () => {
    const session = confirmingLone({ citaOffered: JSON.stringify({ text: "Selecciona el horario:", rows: [{ id: "07:00|07:30", title: "07:00 - 07:30" }] }) });
    session.counters.citaHoraPage = 1;

    expect(handle(session, tap("hora_confirm_no")).session.state).toBe("cita_awaiting_hora_select");
  });
});

describe("«sí, cambiar de fecha»: the dates are listed again, with no new verification", () => {
  it.each([
    ["the button", tap("cita_otra_fecha_si")],
    ["si", text("si")],
    ["sí por favor", text("sí por favor")],
    ["1", text("1")],
    ["cambiar", text("cambiar")],
    ["otra fecha", text("otra fecha")],
    ["cambiar de fecha", text("cambiar de fecha")],
    ["otro día", text("otro día")],
  ])("%s", (_label, event) => {
    const result = handle(askedForAnotherDate(), event);

    expect(result.session.state).toBe("cita_fecha_pending");
    expect(queries(result)).toEqual([{ kind: "list_fechas", payload: { codEess: "0000123", especialidadId: "02" } }]);
    expect(result.session.slots.citaBearer).toBe("token");
    expect(result.session.slots.citaFechasDescartadas).toBe(DAY_1);
    expect(sent(result)[0]).toMatchObject({ kind: "send_text" });
  });
});

describe("the dates that come back leave out the ones already declined", () => {
  const pendingWith = (discarded: string): Session => ({
    state: "cita_fecha_pending",
    slots: { ...BASE_SLOTS, citaFecha: "", citaFechasDescartadas: discarded },
    counters: {},
  });

  it("two dates left: the citizen chooses between them (the declined one is not offered)", () => {
    const result = handle(pendingWith(DAY_1), fechasResult([DAY_1, DAY_2, DAY_3]));

    expect(result.session.state).toBe("cita_awaiting_fecha_select");
    const list = sent(result)[0] as { rows: Array<{ id: string }> };
    expect(list.rows.map((row) => row.id)).toEqual([DAY_2, DAY_3]);
  });

  it("one date left: it is taken and its horarios are searched, as with any single date", () => {
    const result = handle(pendingWith(DAY_1), fechasResult([DAY_1, DAY_2]));

    expect(result.session.state).toBe("cita_hora_pending");
    expect(result.session.slots.citaFecha).toBe(DAY_2);
    expect(queries(result)).toEqual([{ kind: "list_horas", payload: { codEess: "0000123", especialidadId: "02", fecha: DAY_2 } }]);
  });

  it("no other date: apology and goodbye, and the flow ends (no loop back to the same day)", () => {
    const result = handle(pendingWith(DAY_1), fechasResult([DAY_1]));

    expect(result.session).toEqual({ state: "cita_declined_closed", slots: {}, counters: {} });
    expect(queries(result)).toHaveLength(0);
    expect(sent(result)).toHaveLength(1);
    expect(sent(result)[0]).toMatchObject({ text: expect.stringContaining("no hay otras fechas") });
    expect(sent(result)[0]).toMatchObject({ text: expect.stringContaining("Ministerio de Salud") });
  });

  it("compares dates by their real day, not by the exact string: DD/MM/YYYY and YYYYMMDD of the same day are the same date", () => {
    const result = handle(pendingWith("31/12/2099"), fechasResult(["20991231", DAY_2, DAY_3]));

    expect((sent(result)[0] as { rows: Array<{ id: string }> }).rows.map((row) => row.id)).toEqual([DAY_2, DAY_3]);
  });

  it("nothing declined yet: the list is untouched", () => {
    const result = handle(pendingWith(""), fechasResult([DAY_1, DAY_2]));

    expect((sent(result)[0] as { rows: Array<{ id: string }> }).rows.map((row) => row.id)).toEqual([DAY_1, DAY_2]);
  });

  it("declining a second lone horario adds its date: nothing declined ever comes back", () => {
    const second: Session = {
      state: "cita_awaiting_hora_confirm",
      slots: { ...BASE_SLOTS, citaFecha: DAY_2, citaFechasDescartadas: DAY_1, citaHoraConfirmId: "08:00|08:30", citaHoraConfirmOnly: "1" },
      counters: {},
    };

    const asked = handle(second, tap("hora_confirm_no")).session;
    expect(asked.slots.citaFechasDescartadas).toBe(`${DAY_1},${DAY_2}`);

    const listed = handle({ ...asked, state: "cita_fecha_pending" }, fechasResult([DAY_1, DAY_2, DAY_3]));
    expect(listed.session.slots.citaFecha).toBe(DAY_3);
  });

  it("declining the same date twice does not repeat it in the memory", () => {
    const again: Session = {
      state: "cita_awaiting_hora_confirm",
      slots: { ...BASE_SLOTS, citaFecha: DAY_1, citaFechasDescartadas: DAY_1, citaHoraConfirmId: "13:00|13:30", citaHoraConfirmOnly: "1" },
      counters: {},
    };

    expect(handle(again, tap("hora_confirm_no")).session.slots.citaFechasDescartadas).toBe(DAY_1);
  });

  it("MINSA failing or the token expiring while listing behaves as in any fecha step", () => {
    const failed = handle(pendingWith(DAY_1), { from: FROM, type: "query_result", queryKind: "list_fechas", result: { status: "error" } });
    expect(failed.session.state).toBe("cita_booking_rejected");

    const unauthorized = { from: FROM, type: "query_result", queryKind: "list_fechas", result: { status: "unauthorized" } } as const;
    const expired = handle(pendingWith(DAY_1), unauthorized);
    expect(expired.session.state).toBe(handle(pendingWith(""), unauthorized).session.state);
    expect(expired.session.slots.citaFechasDescartadas).toBe(DAY_1);
  });
});

describe("«no, salir»: an apology and a goodbye, and the session is closed", () => {
  it.each([
    ["the button", tap("cita_otra_fecha_no")],
    ["no", text("no")],
    ["2", text("2")],
    ["salir", text("salir")],
    ["no, gracias", text("no, gracias")],
  ])("%s", (_label, event) => {
    const result = handle(askedForAnotherDate(), event);

    expect(result.session).toEqual({ state: "cita_declined_closed", slots: {}, counters: {} });
    expect(queries(result)).toHaveLength(0);
    expect(sent(result)).toHaveLength(1);
  });

  it("acknowledges and says goodbye, and does NOT tell the citizen to type a command", () => {
    const [message] = sent(handle(askedForAnotherDate(), tap("cita_otra_fecha_no")));
    const body = (message as { text: string }).text;

    expect(body).toMatch(/entendido/i);
    expect(body).toContain("Ministerio de Salud del Perú");
    expect(body).not.toMatch(/CITAS/);
  });

  it("is a terminal state: the next message starts again with the welcome, token gone", () => {
    expect(TERMINAL_STATES.has("cita_declined_closed")).toBe(true);

    const closed = handle(askedForAnotherDate(), tap("cita_otra_fecha_no"));
    const next = handle(closed.session, text("Hola"));

    expect(sent(next)[0]).toMatchObject({ kind: "send_cta_url" });
    expect(next.session.slots.citaBearer).toBeUndefined();
  });
});

describe("an answer that is neither: the question is asked again", () => {
  it.each(["quizás", "no sé", "hola?"])("%j", (typed) => {
    const asked = askedForAnotherDate();
    const result = handle(asked, text(typed));

    expect(result.session.state).toBe("cita_awaiting_other_fecha");
    expect(queries(result)).toHaveLength(0);
    expect(sent(result)[0]).toMatchObject({ kind: "send_buttons", text: expect.stringContaining("¿Deseas cambiar de fecha?") });
    expect(noteOf(result, "confirmation_unknown")).toMatchObject({ level: "warn", detail: { step: "other_fecha" } });
    expect(result.session.slots.citaFechasDescartadas).toBe(DAY_1);
  });
});

describe("the whole conversation", () => {
  it("decline the only horario, change the date, take the other date's horario", () => {
    const asked = handle(confirmingLone(), tap("hora_confirm_no"));
    const listing = handle(asked.session, tap("cita_otra_fecha_si"));
    const dates = handle(listing.session, fechasResult([DAY_1, DAY_2]));
    const horas = handle(dates.session, horasResult([{ horaInicio: "09:00", horaFin: "09:30" }, { horaInicio: "10:00", horaFin: "10:30" }]));

    expect(horas.session.state).toBe("cita_awaiting_hora_select");
    expect(horas.session.slots.citaFecha).toBe(DAY_2);
  });

  it("the other date also has one horario: it asks again, and now both dates are remembered", () => {
    const asked = handle(confirmingLone(), tap("hora_confirm_no"));
    const listing = handle(asked.session, tap("cita_otra_fecha_si"));
    const dates = handle(listing.session, fechasResult([DAY_1, DAY_2]));
    const horas = handle(dates.session, horasResult([{ horaInicio: "09:00", horaFin: "09:30" }]));
    expect(horas.session.state).toBe("cita_awaiting_hora_confirm");

    const declinedAgain = handle(horas.session, text("no"));
    expect(declinedAgain.session.state).toBe("cita_awaiting_other_fecha");

    const relisted = handle(handle(declinedAgain.session, text("si")).session, fechasResult([DAY_1, DAY_2]));
    expect(relisted.session).toEqual({ state: "cita_declined_closed", slots: {}, counters: {} });
  });
});

describe("it plays well with the rest of the flow", () => {
  it("the state waits for the citizen, so an expired session resumes by listing the dates again", () => {
    expect(AUTHENTICATED_WAITING_STATES).toContain("cita_awaiting_other_fecha");
    expect(resumeStateFor("cita_awaiting_other_fecha")).toBe("cita_fecha_pending");
  });

  it("changing the district forgets the declined dates: they belong to the old place", () => {
    const noCoverage: Session = {
      state: "cita_awaiting_other_distrito",
      slots: { ...BASE_SLOTS, citaFechasDescartadas: DAY_1 },
      counters: {},
    };

    const result = handle(noCoverage, text("sí"));

    expect(result.session.state).toBe("cita_awaiting_distrito_ai");
    expect(result.session.slots.citaFechasDescartadas).toBeUndefined();
  });
});

describe("offerOtherFecha reasons pick their own intro but the same question", () => {
  const session: Session = { state: "cita_booking_pending", slots: { ...BASE_SLOTS }, counters: {} };

  it("both reasons still ask the exact same question and offer the same buttons", () => {
    for (const reason of ["only_declined", "no_horarios"] as const) {
      const result = offerOtherFecha(session, reason);
      expect(sent(result)[0]).toMatchObject({
        kind: "send_buttons",
        buttons: [
          { id: "cita_otra_fecha_si", title: "Sí, otra fecha" },
          { id: "cita_otra_fecha_no", title: "No, salir" },
        ],
      });
    }
  });
});
