import { describe, expect, it } from "vitest";
import { handle } from "./handlers";
import { isQueryEffect, TERMINAL_STATES } from "./handlers-shared";
import { serializeOffered } from "./selection-matchers";
import type { HandlerResult, InboundEvent, QueryResultEvent, SendEffect, Session } from "./types";

const FROM = "sandbox-district";
const text = (value: string): InboundEvent => ({ from: FROM, type: "text", text: value });
const tap = (id: string): InboundEvent => ({ from: FROM, type: "button", listId: id });
const result = (queryKind: QueryResultEvent["queryKind"], body: unknown): QueryResultEvent => ({
  from: FROM,
  type: "query_result",
  queryKind,
  result: body,
});

const sent = (step: HandlerResult): SendEffect[] =>
  step.effects.filter((effect): effect is SendEffect => !isQueryEffect(effect));
const queries = (step: HandlerResult) => step.effects.filter(isQueryEffect);
const firstText = (step: HandlerResult) => (sent(step)[0] as { text: string }).text;

const SJL = { ubigeoInei: "150132", distrito: "SAN JUAN DE LURIGANCHO", provincia: "LIMA", departamento: "LIMA" };
// MINSA's search is fuzzy: asking for San Juan de Lurigancho brings its neighbours too.
const FUZZY_RESULT = [
  SJL,
  { ubigeoInei: "150133", distrito: "SAN JUAN DE MIRAFLORES", provincia: "LIMA", departamento: "LIMA" },
  { ubigeoInei: "150131", distrito: "SAN ISIDRO", provincia: "LIMA", departamento: "LIMA" },
];

function searchingUbigeo(slots: Session["slots"] = {}): Session {
  return {
    state: "cita_ubigeo_pending",
    slots: {
      citaBearer: "token",
      citaDni: "12345678",
      citaDepartamento: "LIMA",
      citaProvincia: "LIMA",
      citaDistrito: "SAN JUAN DE LURIGANCHO",
      ...slots,
    },
    counters: {},
  };
}

const ACK = "Entendido. Buscando especialidades y citas disponibles en *San Juan de Lurigancho*…";

describe("the district is acknowledged before the catalog is queried", () => {
  it("a single ubigeo says which district it is searching in", () => {
    const step = handle(searchingUbigeo(), result("search_ubigeo", { status: "found", items: [SJL] }));

    expect(firstText(step)).toBe(ACK);
    expect(queries(step)).toEqual([{ kind: "list_especialidades", payload: { ubigeo: "150132" } }]);
    expect(step.session.slots.citaUbigeo).toBe("150132");
  });

  it("does not ask «Selecciona tu ubigeo» when the district is already known and one result is exactly it", () => {
    const step = handle(searchingUbigeo(), result("search_ubigeo", { status: "found", items: FUZZY_RESULT }));

    expect(step.session.state).toBe("cita_especialidad_pending");
    expect(firstText(step)).toBe(ACK);
    expect(queries(step)).toEqual([{ kind: "list_especialidades", payload: { ubigeo: "150132" } }]);
    expect(JSON.stringify(step.effects)).not.toContain("Selecciona tu ubigeo");
  });

  it("still asks when nothing is exactly the district that was resolved", () => {
    const step = handle(
      searchingUbigeo({ citaDistrito: "SAN JUAN" }),
      result("search_ubigeo", { status: "found", items: FUZZY_RESULT }),
    );

    expect(step.session.state).toBe("cita_awaiting_ubigeo_select");
    expect(firstText(step)).toBe("Selecciona tu ubigeo:");
  });

  it("still asks when the same name comes back twice and cannot be told apart", () => {
    const twin = { ...SJL, ubigeoInei: "999999", provincia: "OTRA" };
    const step = handle(
      searchingUbigeo({ citaProvincia: "" }),
      result("search_ubigeo", { status: "found", items: [SJL, twin] }),
    );

    expect(step.session.state).toBe("cita_awaiting_ubigeo_select");
  });

  describe("when the citizen answers the ubigeo list", () => {
    const listed = (): Session => ({
      state: "cita_awaiting_ubigeo_select",
      slots: {
        citaBearer: "token",
        citaOffered: serializeOffered({
          text: "Selecciona tu ubigeo:",
          rows: FUZZY_RESULT.map((item) => ({
            id: item.ubigeoInei,
            title: item.distrito.replace("SAN JUAN DE LURIGANCHO", "San Juan de Lurigancho"),
            description: `${item.provincia} — ${item.departamento}`,
          })),
        }),
      },
      counters: {},
    });

    it("taps a row: names the district", () => {
      const step = handle(listed(), tap("150132"));

      expect(firstText(step)).toBe(ACK);
      expect(queries(step)).toEqual([{ kind: "list_especialidades", payload: { ubigeo: "150132" } }]);
    });

    it("types a sentence that names it (the field case): names the district instead of searching in silence", () => {
      const step = handle(listed(), text("que ? pero si te pedi San juan de lurigancho"));

      expect(firstText(step)).toBe(ACK);
      expect(queries(step)).toEqual([{ kind: "list_especialidades", payload: { ubigeo: "150132" } }]);
    });
  });
});

describe("no specialties in the district", () => {
  const empty = (status: unknown = { status: "empty" }): { session: Session; step: HandlerResult } => {
    const session: Session = {
      state: "cita_especialidad_pending",
      slots: {
        citaBearer: "token",
        citaDni: "12345678",
        citaDepartamento: "LIMA",
        citaProvincia: "LIMA",
        citaDistrito: "SAN JUAN DE LURIGANCHO",
        citaUbigeo: "150132",
        initialMessageText: "quiero una cita en San Juan de Lurigancho",
      },
      counters: {},
    };
    return { session, step: handle(session, result("list_especialidades", status)) };
  };

  it("keeps the conversation open and offers another district, naming the one searched", () => {
    const { step } = empty();

    expect(step.session.state).toBe("cita_awaiting_other_distrito");
    expect(TERMINAL_STATES.has(step.session.state)).toBe(false);
    expect(step.outcome).toBe("continue");
    expect(step.session.slots.citaBearer).toBe("token");

    const prompt = sent(step)[0];
    expect(prompt.kind).toBe("send_buttons");
    expect(prompt).toMatchObject({
      text: "No encontramos especialidades disponibles en *San Juan de Lurigancho* en este momento.\n¿Deseas buscar en otro distrito cercano?\n\n[1] Sí, buscar otro distrito\n[2] No, salir",
    });
  });

  it("treats an empty list the same as an empty status", () => {
    expect(empty({ status: "found", items: [] }).step.session.state).toBe("cita_awaiting_other_distrito");
  });

  it.each([
    ["the button", tap("cita_otro_distrito_si")],
    ["«si»", text("si")],
    ["«dale»", text("dale")],
    ["«cambiar»", text("cambiar")],
    ["«1»", text("1")],
  ])("%s asks for another district and forgets only the old one", (_how, event) => {
    const { step: offered } = empty();

    const step = handle(offered.session, event);

    expect(step.session.state).toBe("cita_awaiting_distrito_ai");
    expect(sent(step)[0]).toMatchObject({ text: expect.stringContaining("otro distrito") });
    expect(step.session.slots.citaDistrito).toBeUndefined();
    expect(step.session.slots.citaUbigeo).toBeUndefined();
    expect(step.session.slots.initialMessageText).toBeUndefined();
    expect(step.session.slots.citaBearer).toBe("token");
    expect(step.session.slots.citaDni).toBe("12345678");
  });

  it("the new district is resolved on its own, not from the first message", () => {
    const step = handle(handle(empty().step.session, text("si")).session, text("Miraflores"));

    // "Miraflores" exists twice in Lima, so it is disambiguated — and nothing of
    // the district that was left behind comes back.
    expect(step.session.state).toBe("cita_awaiting_distrito_disambiguation");
    const shown = JSON.stringify(step.effects).toUpperCase();
    expect(shown).toContain("MIRAFLORES");
    expect(shown).not.toContain("LURIGANCHO");
  });

  it.each([
    ["the button", tap("cita_otro_distrito_no")],
    ["«no»", text("no")],
    ["«salir»", text("salir")],
    ["«cancelar»", text("cancelar")],
    ["«no, gracias»", text("no, gracias")],
    ["«2»", text("2")],
  ])("%s says goodbye and leaves the session clean", (_how, event) => {
    const step = handle(empty().step.session, event);

    expect(step.session).toEqual({ state: "cita_no_coverage_closed", slots: {}, counters: {} });
    expect(step.outcome).toBe("closed");
    expect(firstText(step)).toContain("Gracias por comunicarte con el *Ministerio de Salud del Perú*");
  });

  it("after saying goodbye, the next message starts over with the welcome only", () => {
    const closed = handle(empty().step.session, text("no")).session;

    const step = handle(closed, text("hola"));

    expect(sent(step).map((effect) => effect.kind)).toEqual(["send_cta_url", "send_buttons"]);
  });

  it("a confused reply (the field «quee ?») asks again instead of restarting the conversation", () => {
    const { step: offered } = empty();

    const step = handle(offered.session, text("quee ?"));

    expect(step.session.state).toBe("cita_awaiting_other_distrito");
    expect(sent(step)).toHaveLength(1);
    expect(sent(step)[0].kind).toBe("send_buttons");
    expect(JSON.stringify(step.effects)).not.toContain("Ministerio de Salud del Perú");
  });
});

describe("no establishments for the specialty in the district", () => {
  it("offers another district too", () => {
    const session: Session = {
      state: "cita_establecimiento_pending",
      slots: { citaBearer: "token", citaDistrito: "MIRAFLORES", citaEspecialidadId: "02" },
      counters: {},
    };

    const step = handle(session, result("list_establecimientos", { status: "empty" }));

    expect(step.session.state).toBe("cita_awaiting_other_distrito");
    expect(firstText(step)).toContain("No encontramos establecimientos para esa especialidad disponibles en *Miraflores*");
  });
});
