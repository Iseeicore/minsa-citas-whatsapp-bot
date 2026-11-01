import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { Modal } from "@/app/components/ui/Modal";

const render = () =>
  renderToStaticMarkup(createElement(Modal, { title: "Términos y condiciones", onClose: () => {}, footer: "pie" }, "contenido"));

describe("Modal", () => {
  it("is a native dialog named by its title", () => {
    const markup = render();
    const labelledBy = markup.match(/aria-labelledby="([^"]+)"/)?.[1];

    expect(markup.startsWith("<dialog")).toBe(true);
    expect(labelledBy).toBeTruthy();
    expect(markup).toContain(`id="${labelledBy}"`);
    expect(markup).toContain("Términos y condiciones");
  });

  it("darkens the page behind with the backdrop, not with a wrapper", () => {
    expect(render()).toContain("backdrop:bg-sb-navy/60");
  });

  it("shows the body and the footer", () => {
    const markup = render();

    expect(markup).toContain("contenido");
    expect(markup).toContain("pie");
  });
});
