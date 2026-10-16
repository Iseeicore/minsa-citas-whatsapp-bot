import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { CtaLink } from "@/app/components/ui/CtaLink";

describe("CtaLink", () => {
  it("muestra solo la etiqueta del botón, sin subtexto", () => {
    const markup = renderToStaticMarkup(createElement(CtaLink, { href: "https://minsa.test/login", label: "Ir a MINSADIGITAL" }));

    expect(markup).toContain('href="https://minsa.test/login"');
    expect(markup).toContain("Ir a MINSADIGITAL");
    expect(markup).not.toContain("text-xs");
    expect(markup.match(/<span/g)).toHaveLength(1);
  });
});
