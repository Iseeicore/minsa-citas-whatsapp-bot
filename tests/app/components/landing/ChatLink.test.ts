import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { ChatLink } from "@/app/components/landing/ChatLink";
import { OPEN_CHAT_ATTRIBUTE } from "@/lib/constants/chat-launcher";

const LOGIN_URL = "https://minsa.test/login";

describe("ChatLink", () => {
  it("abre el chat cuando el enlace lleva a él", () => {
    const markup = renderToStaticMarkup(createElement(ChatLink, { opensChat: true, href: LOGIN_URL }, "Citas"));

    expect(markup).toContain('href="#chat"');
    expect(markup).toContain(OPEN_CHAT_ATTRIBUTE);
  });

  it("lleva al ingreso, sin el atributo del chat, cuando el chat no está disponible", () => {
    const markup = renderToStaticMarkup(createElement(ChatLink, { opensChat: false, href: LOGIN_URL }, "Citas"));

    expect(markup).toBe(`<a href="${LOGIN_URL}">Citas</a>`);
  });
});
