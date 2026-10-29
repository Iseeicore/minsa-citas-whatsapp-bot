import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { ChatBubble } from "@/app/components/sandbox-chat/ChatBubble";
import type { ChatEntry } from "@/app/components/sandbox-chat/types";
import { SendType } from "@/lib/enums/send-type";
import { ChatEntryAuthor } from "@/lib/enums/chat-entry-author";
import { ReferenciaActionButtonId } from "@/lib/enums/referencia-action-button-id";
import { buildTerminosEffect } from "@/lib/fsm/flows/cita/steps/terminos/terminos-gate";

const BUTTON_TAG = /<button\b[^>]*>/g;

const buttonsEntry: ChatEntry = {
  id: "e1",
  from: ChatEntryAuthor.BOT,
  effect: {
    kind: SendType.BUTTONS,
    text: "¿Registrar?",
    buttons: [
      { id: "si", title: "Registrar" },
      { id: "no", title: "Cancelar" },
    ],
  },
};

const listEntry: ChatEntry = {
  id: "e2",
  from: ChatEntryAuthor.BOT,
  effect: {
    kind: SendType.INTERACTIVE_LIST,
    text: "Elige",
    rows: [{ id: "1", title: "Uno" }],
    actions: [{ id: ReferenciaActionButtonId.CHANGE, title: "Cambiar referencia" }],
  },
};

const buttonTags = (entry: ChatEntry, disabled?: boolean) =>
  renderToStaticMarkup(createElement(ChatBubble, { entry, disabled, onOptionClick: () => {} })).match(BUTTON_TAG) ?? [];

describe("ChatBubble", () => {
  it("mantiene las opciones y Cambiar referencia en el mismo mensaje interactivo", () => {
    const markup = renderToStaticMarkup(createElement(ChatBubble, { entry: listEntry, onOptionClick: () => {} }));
    expect(markup).toContain("Uno");
    expect(markup).toContain("Cambiar referencia");
    expect(buttonTags(listEntry)).toHaveLength(2);
  });
  it("muestra deshabilitados los botones y las filas de un mensaje que ya no es el vigente", () => {
    for (const entry of [buttonsEntry, listEntry]) {
      const tags = buttonTags(entry, true);
      expect(tags.length).toBeGreaterThan(0);
      expect(tags.every((tag) => tag.includes('disabled=""'))).toBe(true);
    }
  });

  it("deja activos los botones y las filas del mensaje vigente", () => {
    for (const entry of [buttonsEntry, listEntry]) {
      const tags = buttonTags(entry);
      expect(tags.length).toBeGreaterThan(0);
      expect(tags.some((tag) => tag.includes('disabled=""'))).toBe(false);
    }
  });

  it("opens the terms as a modal while they wait for an answer", () => {
    const entry: ChatEntry = { id: "e3", from: ChatEntryAuthor.BOT, effect: buildTerminosEffect() };

    const markup = renderToStaticMarkup(createElement(ChatBubble, { entry, onOptionClick: () => {} }));

    expect(markup).toContain('role="dialog"');
    expect(markup).toContain(buildTerminosEffect().text);
  });

  it("does not open the terms again once they were answered", () => {
    const entry: ChatEntry = { id: "e4", from: ChatEntryAuthor.BOT, effect: buildTerminosEffect() };

    const markup = renderToStaticMarkup(createElement(ChatBubble, { entry, disabled: true, onOptionClick: () => {} }));

    expect(markup).not.toContain('role="dialog"');
    expect((markup.match(BUTTON_TAG) ?? []).every((tag) => tag.includes('disabled=""'))).toBe(true);
  });
});
