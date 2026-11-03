import { createElement, type ReactElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import ConversationList from "@/app/components/ConversationList";
import EessDetailModal from "@/app/components/EessDetailModal";
import { LandingServices } from "@/app/components/landing/LandingServices";
import { DebugPanel } from "@/app/components/sandbox-chat/DebugPanel";
import { ConfirmDialog } from "@/app/components/ui/ConfirmDialog";
import { Heading } from "@/app/components/ui/Heading";
import { Modal } from "@/app/components/ui/Modal";
import { HeadingVariant } from "@/lib/enums/ui/heading-variant";

const HEADING_TAG = /<(h[1-6])\b[^>]*class="([^"]*)"/g;

const EESS = {
  codigo: "00001",
  nombre: "Hospital",
  direccion: "Av. Uno",
  disa: "Lima",
  distrito: "Lima",
  provincia: "Lima",
  departamento: "Lima",
  horario: "24 horas",
  latitud: null,
  longitud: null,
};

const headings = (element: ReactElement) =>
  [...renderToStaticMarkup(element).matchAll(HEADING_TAG)].map(([, tag, classes]) => [tag, classes.split(" ").sort()]);

const expected = (tag: string, classes: string) => [tag, classes.split(" ").sort()];

describe("Heading", () => {
  it("takes the tag from the level and the classes from the variant", () => {
    const markup = renderToStaticMarkup(createElement(Heading, { level: 2, variant: HeadingVariant.DIALOG, id: "titulo" }, "Título"));

    expect(markup).toBe('<h2 id="titulo" class="text-base font-bold text-sb-navy">Título</h2>');
  });

  it("keeps the size of the variant whatever the level", () => {
    const markup = renderToStaticMarkup(createElement(Heading, { level: 4, variant: HeadingVariant.DIALOG }, "Título"));

    expect(markup).toBe('<h4 class="text-base font-bold text-sb-navy">Título</h4>');
  });

  it("merges the className at the end so it wins over the variant", () => {
    const markup = renderToStaticMarkup(createElement(Heading, { level: 3, variant: HeadingVariant.PANEL, className: "mb-2 text-red-500" }, "x"));

    expect(markup).toBe('<h3 class="font-semibold mb-2 text-red-500">x</h3>');
  });

  it.each([
    ["Modal", createElement(Modal, { title: "t", onClose: () => {}, footer: "f" }), [expected("h2", "text-base font-bold text-sb-navy")]],
    [
      "ConfirmDialog",
      createElement(ConfirmDialog, { title: "t", message: "m", confirmLabel: "s", cancelLabel: "n", onConfirm: () => {}, onCancel: () => {} }),
      [expected("h2", "text-base font-bold text-sb-navy")],
    ],
    [
      "EessDetailModal",
      createElement(EessDetailModal, { eess: EESS, directionsUrl: "https://maps.test", onClose: () => {} }),
      [expected("h2", "font-gotham text-xl leading-tight font-bold md:text-3xl")],
    ],
    [
      "ConversationList",
      createElement(ConversationList, { selectedId: null, onSelect: () => {} }),
      [expected("h2", "border-b border-gray-100 px-4 py-3 text-xs font-semibold uppercase tracking-wide text-gray-400")],
    ],
    ["DebugPanel", createElement(DebugPanel, { from: null, session: null }), [expected("h3", "mb-2 font-semibold text-gray-700")]],
    [
      "LandingServices",
      createElement(LandingServices, { loginUrl: undefined, chatEnabled: false }),
      [expected("h2", "mt-4 font-gotham text-xl font-bold md:mt-5 md:text-4xl")],
    ],
  ])("%s keeps the tag and the classes its titles had", (_, element, titles) => {
    expect(headings(element)).toEqual(titles);
  });
});
