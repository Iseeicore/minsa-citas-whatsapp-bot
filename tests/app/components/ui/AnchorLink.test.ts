import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { AnchorLink } from "@/app/components/ui/AnchorLink";
import { ButtonVariant } from "@/lib/enums/button-variant";

describe("AnchorLink", () => {
  it("sin estilo es un enlace nativo sin el atributo class", () => {
    expect(renderToStaticMarkup(createElement(AnchorLink, { href: "tel:113", "aria-label": "Llamar" }, "113"))).toBe(
      '<a href="tel:113" aria-label="Llamar">113</a>',
    );
  });

  it("arma el aspecto con la variante y deja pasar los atributos nativos", () => {
    const markup = renderToStaticMarkup(
      createElement(AnchorLink, { href: "https://minsa.test", target: "_blank", rel: "noreferrer", variant: ButtonVariant.NAV }, "Ir"),
    );

    expect(markup).toContain('target="_blank"');
    expect(markup).toContain('rel="noreferrer"');
    expect(markup).toMatch(/^<a href="https:\/\/minsa\.test"[^>]* class="[^"]+">Ir<\/a>$/);
  });

  it("sin destino no inventa un href", () => {
    expect(renderToStaticMarkup(createElement(AnchorLink, { href: undefined }, "Servicios"))).toBe("<a>Servicios</a>");
  });
});
