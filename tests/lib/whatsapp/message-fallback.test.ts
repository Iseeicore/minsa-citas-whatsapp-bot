import { describe, expect, it } from "vitest";
import { toNumberedTextEffect } from "@/lib/whatsapp/message-fallback";
import { findLimitViolations } from "@/lib/whatsapp/message-limits";
import { SendType } from "@/lib/enums/send-type";
import { WHATSAPP_TEXT_BODY_MAX } from "@/lib/constants/limits/whatsapp";

describe("toNumberedTextEffect: a message Meta would refuse becomes a plain text with numbered options", () => {
  it("writes the body and then the buttons as a numbered list", () => {
    const effect = toNumberedTextEffect({
      kind: SendType.BUTTONS,
      text: "¿Confirmas la cita?",
      buttons: [
        { id: "si", title: "Sí, confirmar" },
        { id: "no", title: "No, salir" },
      ],
    });

    expect(effect).toEqual({ kind: SendType.TEXT, text: "¿Confirmas la cita?\n\n1. Sí, confirmar\n2. No, salir" });
  });

  it("numbers the rows of a list by their titles, in the order they were offered", () => {
    const effect = toNumberedTextEffect({
      kind: SendType.INTERACTIVE_LIST,
      text: "Selecciona el horario:",
      rows: [
        { id: "08:00|08:30", title: "8:00 - 8:30 AM", description: "1 cupo(s) disponibles" },
        { id: "09:00|09:30", title: "9:00 - 9:30 AM" },
        { id: "10:00|10:30", title: "10:00 - 10:30 AM" },
      ],
    });

    expect(effect).toEqual({
      kind: SendType.TEXT,
      text: "Selecciona el horario:\n\n1. 8:00 - 8:30 AM\n2. 9:00 - 9:30 AM\n3. 10:00 - 10:30 AM",
    });
  });

  it("keeps the link of a call-to-action button so the person can still open it", () => {
    const effect = toNumberedTextEffect({
      kind: SendType.CTA_URL,
      text: "Regístrate aquí",
      buttonText: "Ir al portal",
      url: "https://example.org",
    });

    expect(effect).toEqual({ kind: SendType.TEXT, text: "Regístrate aquí\n\nIr al portal: https://example.org" });
  });

  it("shortens the body, never the options, when everything does not fit in a text message", () => {
    const effect = toNumberedTextEffect({
      kind: SendType.INTERACTIVE_LIST,
      text: "x".repeat(WHATSAPP_TEXT_BODY_MAX),
      rows: Array.from({ length: 12 }, (_, index) => ({ id: String(index), title: `Opción ${index + 1}` })),
    });

    expect(effect.text.length).toBeLessThanOrEqual(WHATSAPP_TEXT_BODY_MAX);
    expect(
      effect.text.endsWith(
        "\n\n1. Opción 1\n2. Opción 2\n3. Opción 3\n4. Opción 4\n5. Opción 5\n6. Opción 6\n7. Opción 7\n8. Opción 8\n9. Opción 9\n10. Opción 10\n11. Opción 11\n12. Opción 12",
      ),
    ).toBe(true);
  });

  it("cuts a text that is already too long down to the text limit", () => {
    const effect = toNumberedTextEffect({ kind: SendType.TEXT, text: "y".repeat(WHATSAPP_TEXT_BODY_MAX + 50) });

    expect(effect.kind).toBe(SendType.TEXT);
    expect(effect.text.length).toBeLessThanOrEqual(WHATSAPP_TEXT_BODY_MAX);
  });

  it("always produces a message within Meta limits, whatever was broken in the original", () => {
    const broken = toNumberedTextEffect({
      kind: SendType.BUTTONS,
      text: "z".repeat(5000),
      buttons: Array.from({ length: 5 }, (_, index) => ({ id: "same", title: `Un título de botón demasiado largo ${index}` })),
    });

    expect(findLimitViolations(broken)).toEqual([]);
  });
});
