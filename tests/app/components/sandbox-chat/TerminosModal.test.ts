import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { TerminosModal } from "@/app/components/sandbox-chat/TerminosModal";
import { buildTerminosEffect } from "@/lib/fsm/flows/cita/steps/terminos/terminos-gate";

const BUTTON_TAG = /<button\b[^>]*>[^<]*<\/button>/g;

const render = () =>
  renderToStaticMarkup(createElement(TerminosModal, { effect: buildTerminosEffect(), onSelect: () => {}, onClose: () => {} }));

describe("TerminosModal", () => {
  it("is a modal dialog with the title of the terms", () => {
    const markup = render();

    expect(markup).toContain('role="dialog"');
    expect(markup).toContain("Términos y condiciones");
  });

  it("has a scrollable content area with a maximum height", () => {
    expect(render()).toMatch(/class="[^"]*max-h-[^"]*overflow-y-auto[^"]*"/);
  });

  it("asks to tick «Acepto los términos y condiciones» and keeps «Continuar» disabled until then", () => {
    const markup = render();
    const continuar = markup.match(BUTTON_TAG)?.find((tag) => tag.includes("Continuar"));

    expect(markup).toContain('type="checkbox"');
    expect(markup).toContain("Acepto los términos y condiciones");
    expect(continuar).toContain('disabled=""');
  });

  it("lets the person decline with «No acepto»", () => {
    const noAcepto = render()
      .match(BUTTON_TAG)
      ?.find((tag) => tag.includes("No acepto"));

    expect(noAcepto).toBeDefined();
    expect(noAcepto).not.toContain('disabled=""');
  });
});
