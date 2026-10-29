import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import TerminosPage, { metadata } from "@/app/terminos/page";
import { TERMINOS_CONTENIDO, TERMINOS_TITULO_TEXT } from "@/lib/constants/textos/terminos";

describe("terms page", () => {
  it("shows the title and the same content the Chat-bot modal shows", () => {
    const markup = renderToStaticMarkup(createElement(TerminosPage));

    expect(markup).toContain(`<h1`);
    expect(markup).toContain(TERMINOS_TITULO_TEXT);
    expect(markup).toContain(TERMINOS_CONTENIDO);
  });

  it("names the browser tab with the title", () => {
    expect(metadata.title).toBe(TERMINOS_TITULO_TEXT);
  });
});
