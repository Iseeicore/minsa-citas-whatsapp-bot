import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { ChatListPicker } from "@/app/components/sandbox-chat/ChatListPicker";
import type { ListRow } from "@/lib/fsm/core/types";

const referencia = (especialidad: string, estado: string) => ({
  especialidad,
  numero: "000",
  destino: "HOSPITAL SINTETICO",
  origen: "CENTRO SINTETICO",
  fecha: "01/10/2026",
  estado,
});

const rows: ListRow[] = [
  { id: "aceptada", title: "CARDIOLOGIA", referencia: referencia("CARDIOLOGIA", "ACEPTADO") },
  { id: "recibida", title: "NEUROLOGIA", referencia: referencia("NEUROLOGIA", "PACIENTE RECIBIDO") },
];

const render = (disabled = false): string =>
  renderToStaticMarkup(createElement(ChatListPicker, { rows, disabled, onSelect: () => {} }));

const count = (markup: string, fragment: string) => markup.split(fragment).length - 1;

describe("ChatListPicker con referencias", () => {
  it("un mensaje antiguo deshabilita todas las tarjetas como antes", () => {
    expect(count(render(true), 'disabled=""')).toBe(2);
  });
});
