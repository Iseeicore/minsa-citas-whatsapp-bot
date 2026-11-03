import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { LandingHeader } from "@/app/components/landing/LandingHeader";

const LOGIN_URL = "https://minsa.test/login";

function navLinks(chatEnabled: boolean): string[][] {
  const markup = renderToStaticMarkup(createElement(LandingHeader, { loginUrl: LOGIN_URL, chatEnabled }));
  const nav = markup.slice(markup.indexOf("<nav"), markup.indexOf("</nav>"));
  return [...nav.matchAll(/<a [^>]*href="([^"]*)"[^>]*>([^<]*)<\/a>/g)].map(([, href, label]) => [href, label]);
}

describe("LandingHeader", () => {
  it("arma el menú con un enlace por opción, en orden, y lleva al chat cuando está disponible", () => {
    expect(navLinks(true)).toEqual([
      ["/", "Inicio"],
      [LOGIN_URL, "Servicios"],
      ["#chat", "Citas en línea"],
    ]);
  });

  it("lleva «Citas en línea» al ingreso cuando el chat no está disponible", () => {
    expect(navLinks(false)[2]).toEqual([LOGIN_URL, "Citas en línea"]);
  });
});
