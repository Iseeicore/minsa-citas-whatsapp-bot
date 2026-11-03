import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import Home from "@/app/configuracion-visor-sandbox/VisorConsola";

describe("VisorConsola", () => {
  it("muestra en el switch las opciones Chat real y Sandbox, con la real activa por omisión", () => {
    const markup = renderToStaticMarkup(createElement(Home, { imageMaxBytes: 1024 }));
    const toggle = markup.slice(markup.indexOf('role="switch"'), markup.indexOf("</button>", markup.indexOf('role="switch"')));

    expect(toggle.indexOf("Chat real")).toBeGreaterThan(-1);
    expect(toggle.indexOf("Chat real")).toBeLessThan(toggle.indexOf("Sandbox"));
    expect(toggle).toMatch(/<span class="[^"]*text-wa-header"><svg[^>]*>.*?<\/svg>Chat real<\/span>/);
    expect(toggle).toMatch(/<span class="[^"]*text-gray-500"><svg[^>]*>.*?<\/svg>Sandbox<\/span>/);
  });
});
