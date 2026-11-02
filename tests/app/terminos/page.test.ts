import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import TerminosPage, { metadata } from "@/app/terminos/page";
import { DOCUMENTOS_TITULO_TEXT } from "@/lib/constants/textos/terminos";
import { DOCUMENTOS_SECCIONES } from "@/lib/constants/documentos-aceptacion";

describe("terms page", () => {
  it("shows the title and one section per document, each with its anchor, heading and content", () => {
    const markup = renderToStaticMarkup(createElement(TerminosPage));

    expect(markup).toContain(`<h1`);
    expect(markup).toContain(DOCUMENTOS_TITULO_TEXT);
    expect(DOCUMENTOS_SECCIONES.map((seccion) => [seccion.ancla, seccion.titulo])).toEqual([
      ["terminos", "Términos y condiciones"],
      ["datos-personales", "Protección de datos personales"],
    ]);
    for (const seccion of DOCUMENTOS_SECCIONES) {
      expect(markup).toContain(`id="${seccion.ancla}"`);
      expect(markup).toContain(seccion.titulo);
      expect(markup).toContain(seccion.contenido);
    }
  });

  it("names the browser tab with the title", () => {
    expect(metadata.title).toBe(DOCUMENTOS_TITULO_TEXT);
  });
});
