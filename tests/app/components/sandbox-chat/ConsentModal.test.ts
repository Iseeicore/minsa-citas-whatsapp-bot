import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { ConsentModal } from "@/app/components/sandbox-chat/ConsentModal";
import { buildTerminosEffect } from "@/lib/fsm/flows/cita/steps/terminos/terminos-gate";
import { SendType } from "@/lib/enums/send-type";
import type { SendConsentEffect } from "@/lib/fsm/core/types";

const BUTTON_TAG = /<button\b[^>]*>[^<]*<\/button>/g;

const WITHOUT_CHECKBOX: SendConsentEffect = {
  kind: SendType.CONSENT,
  title: "Autorización",
  text: "Necesitamos tu autorización.",
  content: "Detalle de la autorización.",
  buttons: [
    { id: "si", title: "Sí, autorizo" },
    { id: "no", title: "No autorizo" },
  ],
  acceptLabel: "Acepto, autorizo mis datos",
  checks: [],
  reopenLabel: "Revisar la autorización",
  whatsappText: "¿Nos autorizas?",
};

const render = (effect: SendConsentEffect = buildTerminosEffect()) =>
  renderToStaticMarkup(createElement(ConsentModal, { effect, onSelect: () => {}, onClose: () => {} }));

describe("ConsentModal", () => {
  it("is a modal dialog with the title of both documents", () => {
    const markup = render();

    expect(markup).toContain("<dialog");
    expect(markup).toContain("Términos y protección de datos personales");
  });

  it("shows one box per document and keeps «Continuar» disabled until both are ticked", () => {
    const markup = render();
    const continuar = markup.match(BUTTON_TAG)?.find((tag) => tag.includes("Continuar"));

    expect(markup.match(/type="checkbox"/g)).toHaveLength(2);
    expect(markup).toContain("Acepto los términos y condiciones");
    expect(markup).toContain("Autorizo el tratamiento de mis datos personales");
    expect(continuar).toContain('disabled=""');
  });

  it("lets the person decline with «No acepto»", () => {
    const noAcepto = render()
      .match(BUTTON_TAG)
      ?.find((tag) => tag.includes("No acepto"));

    expect(noAcepto).toBeDefined();
    expect(noAcepto).not.toContain('disabled=""');
  });

  it("without boxes shows no checkbox and leaves the accept button enabled with its own label", () => {
    const markup = render(WITHOUT_CHECKBOX);
    const accept = markup.match(BUTTON_TAG)?.find((tag) => tag.includes("Acepto, autorizo mis datos"));
    const decline = markup.match(BUTTON_TAG)?.find((tag) => tag.includes("No autorizo"));

    expect(markup).not.toContain('type="checkbox"');
    expect(accept).toBeDefined();
    expect(accept).not.toContain('disabled=""');
    expect(decline).toBeDefined();
  });
});
