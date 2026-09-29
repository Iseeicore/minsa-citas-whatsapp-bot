import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { buildWelcomeEffect, WELCOME_MESSAGE_TEXT } from "@/lib/fsm/routing/welcome";

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
