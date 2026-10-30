import { afterEach, describe, expect, it, vi } from "vitest";
import { toWhatsAppEffects } from "@/lib/whatsapp/consent-effects";
import { buildTerminosEffect } from "@/lib/fsm/flows/cita/steps/terminos/terminos-gate";
import { findLimitViolations } from "@/lib/whatsapp/message-limits";
import {
  TERMINOS_BUTTONS,
  TERMINOS_PRIVACIDAD_WHATSAPP_TEXT,
  TERMINOS_PROMPT_TEXT,
  TERMINOS_TITULO_TEXT,
  TERMINOS_VER_BUTTON_TEXT,
  terminosWhatsappBodyText,
} from "@/lib/constants/textos/terminos";
import { SendType } from "@/lib/enums/send-type";
import type { ChannelSendEffect, SendConsentEffect } from "@/lib/fsm/core/types";
import { captureLogs } from "@/tests/support/capture-logs";

const URL = "https://bot.minsa.test/terminos";

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("toWhatsAppEffects", () => {
  it("with TERMINOS_URL sends the «Ver términos» link and then the Acepto / No acepto buttons", () => {
    vi.stubEnv("TERMINOS_URL", URL);

    const effects = toWhatsAppEffects(buildTerminosEffect());

    expect(effects).toEqual([
      { kind: SendType.CTA_URL, text: TERMINOS_TITULO_TEXT, buttonText: TERMINOS_VER_BUTTON_TEXT, url: URL },
      { kind: SendType.BUTTONS, text: terminosWhatsappBodyText(TERMINOS_PROMPT_TEXT), buttons: TERMINOS_BUTTONS },
    ]);
  });

  it("without TERMINOS_URL sends only the buttons and warns that the link is missing", () => {
    vi.stubEnv("TERMINOS_URL", "");
    const lines = captureLogs();

    const effects = toWhatsAppEffects(buildTerminosEffect());

    expect(effects).toEqual([{ kind: SendType.BUTTONS, text: terminosWhatsappBodyText(TERMINOS_PROMPT_TEXT), buttons: TERMINOS_BUTTONS }]);
    expect(lines).toEqual([expect.objectContaining({ level: "warn", event: "terminos.url_missing" })]);
  });

  it("puts the WhatsApp privacy sentence in the question, outside the terms content, and never says «Extra»", () => {
    vi.stubEnv("TERMINOS_URL", URL);

    const question = toWhatsAppEffects(buildTerminosEffect()).at(-1);

    expect(question?.text).toContain(TERMINOS_PRIVACIDAD_WHATSAPP_TEXT);
    expect(question?.text).toContain(
      "Por WhatsApp solo recibimos tu número y los mensajes que nos envías para atenderte. Meta no comparte con el MINSA tu dirección IP.",
    );
    expect(question?.text).not.toMatch(/extra/i);
  });

  it("stays within the Meta limits for the body, the buttons and the link", () => {
    vi.stubEnv("TERMINOS_URL", URL);

    const effects = toWhatsAppEffects(buildTerminosEffect());

    expect(effects.flatMap((effect) => findLimitViolations(effect))).toEqual([]);
  });

  it("without the terms link sends only its own WhatsApp question and buttons, with no warning", () => {
    vi.stubEnv("TERMINOS_URL", "");
    const lines = captureLogs();
    const consent: SendConsentEffect = { ...buildTerminosEffect(), withTerminosLink: undefined, whatsappText: "¿Nos autorizas?" };

    expect(toWhatsAppEffects(consent)).toEqual([{ kind: SendType.BUTTONS, text: "¿Nos autorizas?", buttons: TERMINOS_BUTTONS }]);
    expect(lines).toEqual([]);
  });

  it("leaves every other message as it is", () => {
    const text: ChannelSendEffect = { kind: SendType.TEXT, text: "hola" };

    expect(toWhatsAppEffects(text)).toEqual([text]);
  });
});
