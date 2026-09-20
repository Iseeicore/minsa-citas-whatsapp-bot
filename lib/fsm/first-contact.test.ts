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

const CITA_FIRST_MESSAGE = "Sabes quiero una cita para san Juan de Lurigancho para medicina general";

describe("first contact: a greeting or anything generic", () => {
  it.each(["Hola", "Buenos días", "ayuda por favor"])(
    "%j gets the welcome and its button, and nothing else",
    (message) => {
      const result = handleFirstContact(message);

      expect(sent(result).map((effect) => effect.kind)).toEqual(["send_cta_url", "send_buttons"]);
      const [welcome, follow] = sent(result);
      expect(welcome.kind === "send_cta_url" && welcome.text).toContain("Ministerio de Salud del Perú");
      expect(follow.kind === "send_buttons" && follow.buttons).toEqual([{ id: "seguir_aqui", title: "Seguir aquí" }]);
      expect(sent(result).some((effect) => effect.kind === "send_interactive_list")).toBe(false);
      expect(JSON.stringify(result.effects)).not.toContain("¿En qué podemos ayudarte hoy?");
    },
  );

  it("waits in main_menu, keeping only a real message as the opening message", () => {
    expect(handleFirstContact("Hola").session).toEqual({ state: "main_menu", slots: {}, counters: {} });
    expect(handleFirstContact("ayuda por favor").session.slots).toEqual({ initialMessageText: "ayuda por favor" });
    expect(handleFirstContact(undefined).session.state).toBe("main_menu");
  });

  it("shows the menu only when the citizen answers", () => {
    const waiting = handleFirstContact("Hola").session;

    const byButton = handle(waiting, tap("seguir_aqui"));
    expect(sent(byButton).map((effect) => effect.kind)).toEqual(["send_interactive_list"]);

    const byText = handle(waiting, text("hola"));
    expect(sent(byText).map((effect) => effect.kind)).toEqual(["send_interactive_list"]);
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

  it("does not skip the welcome for something that is not a new cita", () => {
    for (const message of ["quiero cancelar mi cita de odontología en Miraflores", "quiero una cita"]) {
      expect(sent(handleFirstContact(message)).map((effect) => effect.kind)).toEqual(["send_cta_url", "send_buttons"]);
    }
  });

  it("continues with the DNI as any Cita flow does", () => {
    const started = handleFirstContact(CITA_FIRST_MESSAGE).session;

    const next = handle(started, text("12345678"));

    expect(next.session.state).toBe("cita_validate_pending");
    expect(next.session.slots.citaDistritoHintText).toBeDefined();
  });
});

describe("returning after a finished cita or reclamo", () => {
  const finished = (state: string): Session => ({ state, slots: { citaDni: "12345678" }, counters: {} });

  it.each(["cita_booking_rejected", "cita_booked", "reclamo_confirmed"])("%s + «hola»: welcome and button, no menu chained", (state) => {
    const result = handle(finished(state), text("hola"));

    expect(sent(result).map((effect) => effect.kind)).toEqual(["send_cta_url", "send_buttons"]);
    expect(result.session).toEqual({ state: "main_menu", slots: {}, counters: {} });
  });

  it("does not lose a clear request typed on the way back", () => {
    const result = handle(finished("cita_booking_rejected"), text(CITA_FIRST_MESSAGE));

    expect(result.session.state).toBe("cita_awaiting_dni");
    expect(result.session.slots.citaDni).toBeUndefined();
    expect(normalizeText(String(result.session.slots.citaEspecialidadHintText))).toBe("MEDICINA GENERAL");
  });
});
