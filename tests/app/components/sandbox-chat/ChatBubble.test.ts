import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { ChatBubble } from "@/app/components/sandbox-chat/ChatBubble";
import type { ChatEntry } from "@/app/components/sandbox-chat/types";
import { SendType } from "@/lib/enums/send-type";

const BUTTON_TAG = /<button\b[^>]*>/g;

const buttonsEntry: ChatEntry = {
  id: "e1",
  from: "bot",
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
  from: "bot",
  effect: { kind: SendType.INTERACTIVE_LIST, text: "Elige", rows: [{ id: "1", title: "Uno" }] },
};

const buttonTags = (entry: ChatEntry, disabled?: boolean) =>
  renderToStaticMarkup(createElement(ChatBubble, { entry, disabled, onOptionClick: () => {} })).match(BUTTON_TAG) ?? [];

describe("ChatBubble", () => {
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
});
