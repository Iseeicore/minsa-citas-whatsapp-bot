import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { Modal } from "@/app/components/ui/Modal";

const render = () =>
  renderToStaticMarkup(createElement(Modal, { title: "Términos y condiciones", onClose: () => {}, footer: "pie" }, "contenido"));

describe("Modal", () => {
  it("is an accessible modal dialog named by its title", () => {
    const markup = render();
    const labelledBy = markup.match(/aria-labelledby="([^"]+)"/)?.[1];

    expect(markup).toContain('role="dialog"');
    expect(markup).toContain('aria-modal="true"');
    expect(labelledBy).toBeTruthy();
    expect(markup).toContain(`id="${labelledBy}"`);
    expect(markup).toContain("Términos y condiciones");
  });

  it("shows the body and the footer", () => {
    const markup = render();

    expect(markup).toContain("contenido");
    expect(markup).toContain("pie");
  });
});
