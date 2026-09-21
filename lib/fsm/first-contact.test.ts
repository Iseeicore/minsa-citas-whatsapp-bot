import { describe, expect, it } from "vitest";
import { normalizeText } from "./domain";
import { handleFirstContact } from "./first-contact";
import { handle } from "./handlers";
import { isQueryEffect } from "./handlers-shared";
import type { HandlerResult, InboundEvent, SendEffect, Session } from "./types";

const FROM = "sandbox-first-contact";
const text = (value: string): InboundEvent => ({ from: FROM, type: "text", text: value });
const tap = (id: string): InboundEvent => ({ from: FROM, type: "button", listId: id });

const sent = (result: HandlerResult): SendEffect[] =>
  result.effects.filter((effect): effect is SendEffect => !isQueryEffect(effect));

const firstListTitle = (result: HandlerResult): string =>
  JSON.stringify(sent(result).find((effect) => effect.kind === "send_interactive_list"));

const CITA_FIRST_MESSAGE = "Sabes quiero una cita para san Juan de Lurigancho para medicina general";

describe("first contact: a greeting", () => {
  it.each(["Hola", "Buenos días", "Buenas tardes"])(
    "%j gets ONE welcome message with the link button, and nothing else",
    (message) => {
      const result = handleFirstContact(message);

      expect(sent(result)).toHaveLength(1);
      const [welcome] = sent(result);
      expect(welcome.kind).toBe("send_cta_url");
      expect(welcome.kind === "send_cta_url" && welcome.text).toContain("Ministerio de Salud del Perú");
      expect(welcome.kind === "send_cta_url" && welcome.buttonText).toBe("Continuar mi cita");
      expect(welcome.kind === "send_cta_url" && welcome.text).toContain("Prefieres seguir por aquí mismo");
      expect(JSON.stringify(result.effects)).not.toContain("¿En qué podemos ayudarte hoy?");
      expect(JSON.stringify(result.effects)).not.toContain("send_buttons");
    },
  );

  it("waits in main_menu, keeping only a real message as the opening message", () => {
    expect(handleFirstContact("Hola").session).toEqual({ state: "main_menu", slots: {}, counters: {} });
    expect(handleFirstContact("ayuda por favor").session.slots).toEqual({ initialMessageText: "ayuda por favor" });
    expect(handleFirstContact(undefined).session.state).toBe("main_menu");
  });

  it("shows the menu only when the citizen answers, in writing", () => {
    const waiting = handleFirstContact("Hola").session;

    const byText = handle(waiting, text("hola"));
    expect(sent(byText).map((effect) => effect.kind)).toEqual(["send_interactive_list"]);
  });

  it("goes straight to the flow when what they write after the welcome is a request", () => {
    const waiting = handleFirstContact("Hola").session;

    const step = handle(waiting, text("quiero una cita de odontología en Miraflores"));

    expect(step.session.state).toBe("cita_awaiting_dni");
    expect(step.effects.some(isQueryEffect)).toBe(false);
  });

  it("still answers the old «Seguir aquí» button of a welcome already sitting in a chat", () => {
    const waiting = handleFirstContact("Hola").session;

    const byButton = handle(waiting, tap("seguir_aqui"));
    expect(sent(byButton).map((effect) => effect.kind)).toEqual(["send_interactive_list"]);
  });
});

describe("first contact: a clear request for a cita", () => {
  it("goes straight to the DNI with the specialty and district already loaded", () => {
    const result = handleFirstContact(CITA_FIRST_MESSAGE);

    expect(result.session.state).toBe("cita_awaiting_dni");
    expect(normalizeText(String(result.session.slots.citaDistritoHintText))).toBe("SAN JUAN DE LURIGANCHO");
    expect(normalizeText(String(result.session.slots.citaEspecialidadHintText))).toBe("MEDICINA GENERAL");
    expect(result.session.slots.initialMessageText).toBe(CITA_FIRST_MESSAGE);

    expect(sent(result)).toEqual([
      {
        kind: "send_text",
        text: "¡Hola! Te ayudaremos a agendar tu cita de Medicina General en San Juan de Lurigancho. Para comenzar, por favor indícanos tu número de DNI (8 dígitos):",
      },
    ]);
  });

  it("names only what it understood", () => {
    expect(sent(handleFirstContact("quiero una cita de odontología"))[0]).toMatchObject({
      text: expect.stringContaining("tu cita de Odontología. Para comenzar"),
    });
    expect(sent(handleFirstContact("necesito agendar en Miraflores"))[0]).toMatchObject({
      text: expect.stringContaining("tu cita en Miraflores. Para comenzar"),
    });
  });

  it("understands a short request that only names the specialty", () => {
    expect(sent(handleFirstContact("Quiero cita en SJL para medicina general"))[0]).toMatchObject({
      text: expect.stringContaining("tu cita de Medicina General. Para comenzar"),
    });
  });

  // Field-tested gap: "necesito cita en medicina interna" fell to the generic
  // menu because MEDICINA INTERNA wasn't in ESPECIALIDAD_ROOTS (only 9 roots
  // + the "MEDICINA GENERAL" special case existed) — see cita-hints.ts.
  it.each([
    ["necesito cita en medicina interna", "Medicina Interna"],
    ["quiero cita de cirugía general", "Cirugía General"],
    ["quiero una cita de medicina familiar", "Medicina Familiar"],
    ["necesito cita en urología", "Urología"],
    ["quiero cita de otorrinolaringología", "Otorrinolaringología"],
    ["necesito cita en neurología", "Neurología"],
    ["quiero cita de psiquiatría", "Psiquiatría"],
    ["necesito cita en endocrinología", "Endocrinología"],
    ["quiero cita de reumatología", "Reumatología"],
    ["necesito cita en obstetricia", "Obstetricia"],
  ])("recognizes %j as a request for %s (no menu detour)", (message, especialidad) => {
    const result = handleFirstContact(message);

    expect(result.session.state).toBe("cita_awaiting_dni");
    expect(sent(result)[0]).toMatchObject({ text: expect.stringContaining(`tu cita de ${especialidad}. Para comenzar`) });
  });

  it("does not treat something that is not a new cita as one: it gets the menu", () => {
    for (const message of ["quiero cancelar mi cita de odontología en Miraflores", "quiero una cita"]) {
      const result = handleFirstContact(message);
      expect(sent(result).map((effect) => effect.kind)).toEqual(["send_interactive_list"]);
      expect(result.session.state).toBe("main_menu");
    }
  });

  it("continues with the DNI as any Cita flow does", () => {
    const started = handleFirstContact(CITA_FIRST_MESSAGE).session;

    const next = handle(started, text("12345678"));

    expect(next.session.state).toBe("cita_validate_pending");
    expect(next.session.slots.citaDistritoHintText).toBeDefined();
  });
});

describe("first contact: the welcome names the emergency line", () => {
  it("tells the citizen to call 106 in a medical emergency, in the same single message", () => {
    const welcome = sent(handleFirstContact("Hola"))[0];

    expect(welcome.kind === "send_cta_url" && welcome.text).toContain("106");
    expect(welcome.kind === "send_cta_url" && welcome.text).toMatch(/emergencia/i);
  });
});

describe("first contact: answering the [1] / [2] the rejection text offers", () => {
  it("«1» opens the Cita flow and asks for the DNI", () => {
    const result = handleFirstContact("1");

    expect(result.session.state).toBe("cita_awaiting_dni");
    expect(sent(result)).toHaveLength(1);
    expect(sent(result)[0]).toMatchObject({ kind: "send_text", text: expect.stringContaining("DNI") });
    expect(sent(result).some((effect) => effect.kind === "send_cta_url" || effect.kind === "send_interactive_list")).toBe(false);
  });

  it("«2» opens the complaint flow", () => {
    const result = handleFirstContact(" 2 ");

    expect(result.session.state).toBe("reclamo_identity_choice");
    expect(sent(result)[0]).toMatchObject({ kind: "send_buttons" });
  });

  it("any other number is just text: it gets the menu", () => {
    for (const message of ["3", "12", "10"]) {
      expect(sent(handleFirstContact(message)).map((effect) => effect.kind)).toEqual(["send_interactive_list"]);
    }
  });

  it("works the same for a citizen returning after a finished flow", () => {
    const finished: Session = { state: "cita_booked", slots: {}, counters: {} };

    expect(handle(finished, text("1")).session.state).toBe("cita_awaiting_dni");
    expect(handle(finished, text("2")).session.state).toBe("reclamo_identity_choice");
  });
});

describe("first contact: a request to file a complaint", () => {
  it.each(["Quiero poner una queja", "quiero hacer un reclamo", "RECLAMO"])("%j goes straight to the complaint flow", (message) => {
    const result = handleFirstContact(message);

    expect(result.session.state).toBe("reclamo_identity_choice");
    expect(sent(result)).toHaveLength(1);
    expect(sent(result)[0]).toMatchObject({
      kind: "send_buttons",
      text: "¡Hola! Vamos a registrar tu reclamo en el Libro de Reclamaciones. ¿Tienes tu DNI a la mano?",
      buttons: [
        { id: "reclamo_con_dni", title: "Sí, tengo DNI" },
        { id: "reclamo_sin_dni", title: "No tengo DNI" },
      ],
    });
  });
});

describe("first contact: text that says nothing structured", () => {
  it.each(["asdfg", "🔥🔥🔥", "ayuda por favor", "necesito hablar con alguien"])(
    "%j gets the menu, without the welcome",
    (message) => {
      const result = handleFirstContact(message);

      expect(sent(result).map((effect) => effect.kind)).toEqual(["send_interactive_list"]);
      expect(firstListTitle(result)).toContain("Agendar una cita médica");
      expect(result.session).toEqual({ state: "main_menu", slots: { initialMessageText: message }, counters: {} });
    },
  );
});

describe("returning after a finished cita or reclamo", () => {
  const finished = (state: string): Session => ({ state, slots: { citaDni: "12345678" }, counters: {} });

  it.each(["cita_booking_rejected", "cita_booked", "reclamo_confirmed"])("%s + «hola»: the welcome alone, no menu chained", (state) => {
    const result = handle(finished(state), text("hola"));

    expect(sent(result).map((effect) => effect.kind)).toEqual(["send_cta_url"]);
    expect(result.session).toEqual({ state: "main_menu", slots: {}, counters: {} });
  });

  it("does not lose a clear request typed on the way back", () => {
    const result = handle(finished("cita_booking_rejected"), text(CITA_FIRST_MESSAGE));

    expect(result.session.state).toBe("cita_awaiting_dni");
    expect(result.session.slots.citaDni).toBeUndefined();
    expect(normalizeText(String(result.session.slots.citaEspecialidadHintText))).toBe("MEDICINA GENERAL");
  });
});
