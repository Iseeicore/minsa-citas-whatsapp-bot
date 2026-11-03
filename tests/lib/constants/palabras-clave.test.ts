import { describe, expect, it } from "vitest";
import {
  CONSULTA_REFERENCIAS_ACTION_ANSWERS,
  NO_ESTABLECIMIENTOS_ANSWERS,
  OTHER_SEDE_ANSWERS,
  REFERENCE_PAGE_ANSWERS,
  TERMINOS_ANSWERS,
} from "@/lib/constants/palabras-clave";
import { TERMINOS_BUTTONS } from "@/lib/constants/textos/terminos";
import { OTRA_SEDE_BUTTON_TEXT } from "@/lib/constants/textos/cita-catalogo";
import { OTRA_ESPECIALIDAD_BUTTON_TEXT } from "@/lib/constants/textos/cita-ubicacion";
import { normalizeText } from "@/lib/fsm/parsing/text/text";
import { ListPageButtonId } from "@/lib/enums/botones/list-page-button-id";
import { OtherDistritoButtonId } from "@/lib/enums/botones/other-distrito-button-id";
import { ReferenciaActionButtonId } from "@/lib/enums/botones/referencia-action-button-id";

describe("mapas de palabras clave", () => {
  it("son mapas con claves de texto y responden igual que antes", () => {
    const maps = [REFERENCE_PAGE_ANSWERS, CONSULTA_REFERENCIAS_ACTION_ANSWERS];

    for (const map of maps) {
      expect(map).toBeInstanceOf(Map);
      expect([...map.keys()].every((key) => typeof key === "string")).toBe(true);
      expect(map.get("CONSTRUCTOR")).toBeUndefined();
    }
    expect(REFERENCE_PAGE_ANSWERS.get("VER MAS OPCIONES")).toBe(ListPageButtonId.NEXT);
    expect(CONSULTA_REFERENCIAS_ACTION_ANSWERS.get("SALIR")).toBe(ReferenciaActionButtonId.EXIT);
  });
});

describe("palabras clave que repiten la etiqueta de un botón", () => {
  it("escribir la etiqueta de cada botón de términos elige lo mismo que tocarlo", () => {
    for (const button of TERMINOS_BUTTONS) expect(TERMINOS_ANSWERS.get(normalizeText(button.title))).toBe(button.id);
  });

  it("escribir la etiqueta Otra sede pide otra sede", () => {
    expect(OTHER_SEDE_ANSWERS.has(normalizeText(OTRA_SEDE_BUTTON_TEXT))).toBe(true);
  });

  it("escribir la etiqueta Otra especialidad sin establecimientos elige otra especialidad", () => {
    expect(NO_ESTABLECIMIENTOS_ANSWERS.get(normalizeText(OTRA_ESPECIALIDAD_BUTTON_TEXT))).toBe(OtherDistritoButtonId.OTHER_ESPECIALIDAD);
  });
});
