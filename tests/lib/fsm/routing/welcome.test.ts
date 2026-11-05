import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { buildWelcomeEffect, buildWelcomeEffects, buildWhatsappOnlyWelcome } from "@/lib/fsm/routing/welcome";
import { welcomeMessageText } from "@/lib/constants/textos/menu";

const ORIGINAL_URL = process.env.MINSA_DIGITAL_APP_URL;

describe("buildWhatsappOnlyWelcome", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("es un texto sin botones, con el portal y el teléfono, sin la pregunta de seguir por aquí", () => {
    vi.stubEnv("MINSA_DIGITAL_APP_URL", "https://digital.minsa.gob.pe");
    vi.stubEnv("CONTACT_PHONE_NUMBER", "989 655 177");

    const effect = buildWhatsappOnlyWelcome();

    expect(effect.kind).toBe("send_text");
    expect(effect.text).toContain("https://digital.minsa.gob.pe");
    expect(effect.text).toContain("*106*");
    expect(effect.text.endsWith("Si tienes alguna duda, llámanos al 989 655 177.")).toBe(true);
    expect(effect.text).not.toContain("Prefieres seguir");
  });

  it("sin teléfono ni portal configurados, queda la bienvenida con el aviso del 106", () => {
    vi.stubEnv("MINSA_DIGITAL_APP_URL", "");
    vi.stubEnv("CONTACT_PHONE_NUMBER", "");

    const { text } = buildWhatsappOnlyWelcome();

    expect(text).toContain("*106*");
    expect(text).not.toContain("llámanos");
    expect(text).not.toContain("entra a");
  });
});

describe("buildWelcomeEffect", () => {
  beforeEach(() => {
    process.env.MINSA_DIGITAL_APP_URL = "https://digital.minsa.gob.pe";
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    if (ORIGINAL_URL === undefined) delete process.env.MINSA_DIGITAL_APP_URL;
    else process.env.MINSA_DIGITAL_APP_URL = ORIGINAL_URL;
  });

  it("whatsapp: la URL del portal va en el texto y los botones llevan a la cita y a la referencia", () => {
    const effect = buildWelcomeEffect("whatsapp");

    expect(effect).toEqual({
      kind: "send_buttons",
      text: welcomeMessageText("https://digital.minsa.gob.pe"),
      buttons: [
        { id: "agendar_cita", title: "Continuar mi cita" },
        { id: "consultar_referencia", title: "Cita con referencia" },
      ],
    });
  });

  it("whatsapp: con REFERENCIAS_ENABLED=false solo queda el botón de la cita", () => {
    vi.stubEnv("REFERENCIAS_ENABLED", "false");

    const effect = buildWelcomeEffect("whatsapp");

    expect(effect).toMatchObject({ kind: "send_buttons", buttons: [{ id: "agendar_cita", title: "Continuar mi cita" }] });
  });

  it("whatsapp: el texto sigue a la variable aunque cambie el dominio y no deja barra final", () => {
    process.env.MINSA_DIGITAL_APP_URL = " https://portal-prueba.example.test/ ";

    const effect = buildWelcomeEffect("whatsapp");

    expect(effect).toMatchObject({ kind: "send_buttons", text: welcomeMessageText("https://portal-prueba.example.test") });
  });

  it("whatsapp: si MINSA_DIGITAL_APP_URL falta (config rota en el deploy), muestra el menú en vez de romper el botón", () => {
    delete process.env.MINSA_DIGITAL_APP_URL;

    const effect = buildWelcomeEffect("whatsapp");

    expect(effect).toEqual({
      kind: "send_interactive_list",
      text: "¿En qué podemos ayudarte hoy?",
      rows: [
        { id: "agendar_cita", title: "Agendar una cita médica" },
        { id: "consultar_referencia", title: "Cita con referencia" },
        { id: "registrar_incidencia", title: "Denuncia anticorrupción" },
        { id: "consultar_incidencia", title: "Consultar mi denuncia" },
      ],
    });
  });

  it("whatsapp: si MINSA_DIGITAL_APP_URL está vacía, también cae al menú (no solo cuando falta)", () => {
    process.env.MINSA_DIGITAL_APP_URL = "";

    const effect = buildWelcomeEffect("whatsapp");

    expect(effect.kind).toBe("send_interactive_list");
  });

  it("web: one list with the short welcome and the menu rows, no button", () => {
    const effect = buildWelcomeEffect("web");

    expect(effect).toEqual({
      kind: "send_interactive_list",
      text: "¡Hola! Soy tu asistente virtual. En caso de emergencia médica, llama al *106* (SAMU).\n¿En qué puedo ayudarte?",
      rows: [
        { id: "agendar_cita", title: "Agendar una cita médica" },
        { id: "consultar_referencia", title: "Cita con referencia" },
        { id: "registrar_incidencia", title: "Denuncia anticorrupción" },
        { id: "consultar_incidencia", title: "Consultar mi denuncia" },
      ],
    });
  });
});

describe("buildWelcomeEffects", () => {
  it("web: un solo mensaje, la bienvenida con las alternativas del menú principal", () => {
    const effects = buildWelcomeEffects("web");

    expect(effects).toEqual([buildWelcomeEffect("web")]);
    expect(JSON.stringify(effects)).not.toContain("¿En qué podemos ayudarte hoy?");
  });

  it("whatsapp: sigue siendo un solo efecto, el de siempre", () => {
    process.env.MINSA_DIGITAL_APP_URL = "https://digital.minsa.gob.pe";

    const effects = buildWelcomeEffects("whatsapp");

    expect(effects).toEqual([buildWelcomeEffect("whatsapp")]);
  });
});
