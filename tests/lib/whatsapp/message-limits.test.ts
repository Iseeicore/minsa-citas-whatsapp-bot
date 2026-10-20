import { describe, expect, it } from "vitest";
import { findLimitViolations } from "@/lib/whatsapp/message-limits";
import { SendType } from "@/lib/enums/send-type";
import { WhatsAppLimitField } from "@/lib/enums/whatsapp-limit-field";
import { WhatsAppLimitRule } from "@/lib/enums/whatsapp-limit-rule";
import { LIST_OPEN_BUTTON_TEXT } from "@/lib/constants/textos/comunes";
import type { ButtonOption, ListRow, SendEffect } from "@/lib/fsm/core/types";

const repeat = (length: number): string => "a".repeat(length);
const buttons = (titles: string[]): ButtonOption[] => titles.map((title, index) => ({ id: `boton_${index}`, title }));
const rows = (count: number): ListRow[] => Array.from({ length: count }, (_, index) => ({ id: `fila_${index}`, title: `Fila ${index}` }));
const buttonsEffect = (list: ButtonOption[], text = "Elige"): SendEffect => ({ kind: SendType.BUTTONS, text, buttons: list });
const listEffect = (list: ListRow[], text = "Elige"): SendEffect => ({ kind: SendType.INTERACTIVE_LIST, text, rows: list });
const ctaEffect = (buttonText: string, text = "Abre el enlace"): SendEffect => ({
  kind: SendType.CTA_URL,
  text,
  buttonText,
  url: "https://example.org",
});

describe("findLimitViolations con texto simple", () => {
  it("acepta un cuerpo de hasta 4096 caracteres", () => {
    expect(findLimitViolations({ kind: SendType.TEXT, text: repeat(4096) })).toEqual([]);
  });

  it("señala un cuerpo de más de 4096 caracteres", () => {
    expect(findLimitViolations({ kind: SendType.TEXT, text: repeat(4097) })).toEqual([
      { field: WhatsAppLimitField.BODY_TEXT, rule: WhatsAppLimitRule.MAX_LENGTH, actual: 4097, limit: 4096 },
    ]);
  });
});

describe("findLimitViolations con botones", () => {
  it("acepta de uno a tres botones con títulos de hasta 20 caracteres y un cuerpo de hasta 1024", () => {
    expect(findLimitViolations(buttonsEffect(buttons([repeat(20)]), repeat(1024)))).toEqual([]);
    expect(findLimitViolations(buttonsEffect(buttons(["Uno", "Dos", "Tres"])))).toEqual([]);
  });

  it("señala un cuerpo interactivo de más de 1024 caracteres", () => {
    expect(findLimitViolations(buttonsEffect(buttons(["Sí"]), repeat(1025)))).toEqual([
      { field: WhatsAppLimitField.BODY_TEXT, rule: WhatsAppLimitRule.MAX_LENGTH, actual: 1025, limit: 1024 },
    ]);
  });

  it("señala un mensaje sin botones y uno con más de tres", () => {
    expect(findLimitViolations(buttonsEffect([]))).toEqual([
      { field: WhatsAppLimitField.BUTTON_COUNT, rule: WhatsAppLimitRule.MIN_COUNT, actual: 0, limit: 1 },
    ]);
    expect(findLimitViolations(buttonsEffect(buttons(["Uno", "Dos", "Tres", "Cuatro"])))).toEqual([
      { field: WhatsAppLimitField.BUTTON_COUNT, rule: WhatsAppLimitRule.MAX_COUNT, actual: 4, limit: 3 },
    ]);
  });

  it("señala el título de más de 20 caracteres con su posición", () => {
    expect(findLimitViolations(buttonsEffect(buttons(["Sí", "Ver todas mis incidencias"])))).toEqual([
      { field: WhatsAppLimitField.BUTTON_TITLE, rule: WhatsAppLimitRule.MAX_LENGTH, index: 1, actual: 25, limit: 20 },
    ]);
  });

  it("señala el identificador de más de 256 caracteres", () => {
    expect(findLimitViolations(buttonsEffect([{ id: repeat(257), title: "Sí" }]))).toEqual([
      { field: WhatsAppLimitField.BUTTON_ID, rule: WhatsAppLimitRule.MAX_LENGTH, index: 0, actual: 257, limit: 256 },
    ]);
    expect(findLimitViolations(buttonsEffect([{ id: repeat(256), title: "Sí" }]))).toEqual([]);
  });

  it("señala un título repetido dentro del mismo mensaje", () => {
    expect(findLimitViolations(buttonsEffect(buttons(["Sí", "No", "Sí"])))).toEqual([
      { field: WhatsAppLimitField.BUTTON_TITLE, rule: WhatsAppLimitRule.UNIQUE, index: 2, actual: 2, limit: 1 },
    ]);
  });
});

describe("findLimitViolations con listas", () => {
  it("acepta de una a diez filas dentro de los límites", () => {
    expect(findLimitViolations(listEffect(rows(1)))).toEqual([]);
    expect(
      findLimitViolations(listEffect([...rows(9), { id: repeat(200), title: repeat(24), description: repeat(72) }], repeat(1024))),
    ).toEqual([]);
  });

  it("señala una lista vacía y una con más de diez filas", () => {
    expect(findLimitViolations(listEffect([]))).toEqual([
      { field: WhatsAppLimitField.ROW_COUNT, rule: WhatsAppLimitRule.MIN_COUNT, actual: 0, limit: 1 },
    ]);
    expect(findLimitViolations(listEffect(rows(11)))).toEqual([
      { field: WhatsAppLimitField.ROW_COUNT, rule: WhatsAppLimitRule.MAX_COUNT, actual: 11, limit: 10 },
    ]);
  });

  it("señala el título, la descripción y el identificador de una fila que se pasan", () => {
    expect(findLimitViolations(listEffect([{ id: repeat(201), title: repeat(25), description: repeat(73) }]))).toEqual([
      { field: WhatsAppLimitField.ROW_TITLE, rule: WhatsAppLimitRule.MAX_LENGTH, index: 0, actual: 25, limit: 24 },
      { field: WhatsAppLimitField.ROW_DESCRIPTION, rule: WhatsAppLimitRule.MAX_LENGTH, index: 0, actual: 73, limit: 72 },
      { field: WhatsAppLimitField.ROW_ID, rule: WhatsAppLimitRule.MAX_LENGTH, index: 0, actual: 201, limit: 200 },
    ]);
  });

  it("señala un identificador de fila repetido dentro de la misma lista", () => {
    expect(
      findLimitViolations(
        listEffect([
          { id: "fila", title: "Uno" },
          { id: "otra", title: "Dos" },
          { id: "fila", title: "Tres" },
        ]),
      ),
    ).toEqual([{ field: WhatsAppLimitField.ROW_ID, rule: WhatsAppLimitRule.UNIQUE, index: 2, actual: 2, limit: 1 }]);
  });

  it("acepta títulos de fila repetidos si los identificadores son distintos", () => {
    expect(
      findLimitViolations(
        listEffect([
          { id: "uno", title: "Miraflores" },
          { id: "dos", title: "Miraflores" },
        ]),
      ),
    ).toEqual([]);
  });

  it("señala un cuerpo de lista de más de 1024 caracteres", () => {
    expect(findLimitViolations(listEffect(rows(1), repeat(1025)))).toEqual([
      { field: WhatsAppLimitField.BODY_TEXT, rule: WhatsAppLimitRule.MAX_LENGTH, actual: 1025, limit: 1024 },
    ]);
  });

  it("la etiqueta del botón que abre la lista cabe en 20 caracteres", () => {
    expect(LIST_OPEN_BUTTON_TEXT.length).toBeLessThanOrEqual(20);
    expect(
      findLimitViolations(listEffect(rows(1))).filter((violation) => violation.field === WhatsAppLimitField.LIST_BUTTON_LABEL),
    ).toEqual([]);
  });
});

describe("findLimitViolations con botón de enlace", () => {
  it("acepta un texto de botón de hasta 20 caracteres", () => {
    expect(findLimitViolations(ctaEffect(repeat(20), repeat(1024)))).toEqual([]);
  });

  it("señala el texto del botón de más de 20 caracteres y el cuerpo de más de 1024", () => {
    expect(findLimitViolations(ctaEffect(repeat(21), repeat(1025)))).toEqual([
      { field: WhatsAppLimitField.BODY_TEXT, rule: WhatsAppLimitRule.MAX_LENGTH, actual: 1025, limit: 1024 },
      { field: WhatsAppLimitField.CTA_DISPLAY_TEXT, rule: WhatsAppLimitRule.MAX_LENGTH, actual: 21, limit: 20 },
    ]);
  });
});
