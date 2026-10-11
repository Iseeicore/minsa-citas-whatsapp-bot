import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { buildWelcomeEffect, buildWelcomeEffects, WELCOME_MESSAGE_TEXT } from "@/lib/fsm/routing/welcome";

const ORIGINAL_URL = process.env.MINSA_DIGITAL_APP_URL;

describe("buildWelcomeEffect", () => {
  beforeEach(() => {
    process.env.MINSA_DIGITAL_APP_URL = "https://digital.minsa.gob.pe";
  });

  afterEach(() => {
    if (ORIGINAL_URL === undefined) delete process.env.MINSA_DIGITAL_APP_URL;
    else process.env.MINSA_DIGITAL_APP_URL = ORIGINAL_URL;
  });

  it("whatsapp: keeps the CTA button, sourced from MINSA_DIGITAL_APP_URL", () => {
    const effect = buildWelcomeEffect("whatsapp");

    expect(effect).toEqual({
      kind: "send_cta_url",
      text: WELCOME_MESSAGE_TEXT,
      buttonText: "Continuar mi cita",
      url: "https://digital.minsa.gob.pe",
    });
  });

  it("whatsapp: el botón sigue a la variable aunque cambie el dominio y no deja barra final", () => {
    process.env.MINSA_DIGITAL_APP_URL = " https://portal-prueba.example.test/ ";

    const effect = buildWelcomeEffect("whatsapp");

    expect(effect).toMatchObject({ kind: "send_cta_url", url: "https://portal-prueba.example.test" });
  });

  it("whatsapp: si MINSA_DIGITAL_APP_URL falta (config rota en el deploy), muestra el menú en vez de romper el botón", () => {
    delete process.env.MINSA_DIGITAL_APP_URL;

    const effect = buildWelcomeEffect("whatsapp");

    expect(effect).toEqual({
      kind: "send_interactive_list",
      text: "¿En qué podemos ayudarte hoy?",
      rows: [
        { id: "agendar_cita", title: "Agendar una cita médica" },
        { id: "registrar_incidencia", title: "Registrar una incidencia" },
      ],
    });
  });

  it("whatsapp: si MINSA_DIGITAL_APP_URL está vacía, también cae al menú (no solo cuando falta)", () => {
    process.env.MINSA_DIGITAL_APP_URL = "";

    const effect = buildWelcomeEffect("whatsapp");

    expect(effect.kind).toBe("send_interactive_list");
  });

  it("web: plain text, no button, with the widget-specific copy", () => {
    const effect = buildWelcomeEffect("web");

    expect(effect.kind).toBe("send_text");
    expect(effect).not.toHaveProperty("buttonText");
    expect(effect).not.toHaveProperty("url");
    expect(effect.kind === "send_text" && effect.text).toContain("asistente virtual de MINSA Digital");
    expect(effect.kind === "send_text" && effect.text).toContain("106");
    expect(effect.kind === "send_text" && effect.text).not.toContain("abre *MINSA Digital*");
  });
});

describe("buildWelcomeEffects", () => {
  it("web: el mensaje de bienvenida seguido de las alternativas del menú principal", () => {
    const effects = buildWelcomeEffects("web");

    expect(effects).toHaveLength(2);
    expect(effects[0]).toMatchObject({ kind: "send_text" });
    expect(effects[1]).toEqual({
      kind: "send_interactive_list",
      text: "¿En qué podemos ayudarte hoy?",
      rows: [
        { id: "agendar_cita", title: "Agendar una cita médica" },
        { id: "registrar_reclamo", title: "Registrar un reclamo" },
      ],
    });
  });

  it("whatsapp: sigue siendo un solo efecto, el de siempre", () => {
    process.env.MINSA_DIGITAL_APP_URL = "https://digital.minsa.gob.pe";

    const effects = buildWelcomeEffects("whatsapp");

    expect(effects).toEqual([buildWelcomeEffect("whatsapp")]);
  });
});
