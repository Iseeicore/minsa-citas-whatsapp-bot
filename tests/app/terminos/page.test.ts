import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import TerminosPage, { metadata } from "@/app/terminos/page";
import { DOCUMENTOS_TITULO_TEXT } from "@/lib/constants/textos/terminos";
import { DOCUMENTOS_SECCIONES } from "@/lib/constants/documentos-aceptacion";

describe("terms page", () => {
  it("shows the logo, the title and only the documents with content, each under its anchor and heading", () => {
    const markup = renderToStaticMarkup(createElement(TerminosPage));

    expect(markup).toContain('alt="Ministerio de Salud del Perú"');
    expect(markup).toContain(`<h1 class="text-2xl font-bold text-sb-navy">${DOCUMENTOS_TITULO_TEXT}</h1>`);
    expect(DOCUMENTOS_SECCIONES.map((seccion) => [seccion.ancla, seccion.titulo])).toEqual([
      ["terminos", "Términos y condiciones"],
      ["datos-personales", "Protección de datos personales"],
    ]);
    expect(markup).not.toContain('id="terminos"');
    expect(markup).not.toContain("Términos y condiciones");
    expect(markup).toContain('id="datos-personales"');
    expect(markup).toContain('<h2 class="text-lg font-bold text-sb-navy">Protección de datos personales</h2>');
    expect(markup).toContain("POLÍTICA DE PRIVACIDAD PARA EL USO DE LA PLATAFORMA “MINSA DIGITAL”</h3>");
  });

  it("names the browser tab with the title", () => {
    expect(metadata.title).toBe(DOCUMENTOS_TITULO_TEXT);
  });
});
