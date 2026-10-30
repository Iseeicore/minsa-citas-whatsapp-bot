import { describe, expect, it } from "vitest";
import {
  CONSULTA_REFERENCIAS_ACTION_ANSWERS,
  NO_ESTABLECIMIENTOS_ANSWERS,
  OTHER_SEDE_ANSWERS,
  REFERENCE_PAGE_ANSWERS,
  TERMINOS_ANSWERS,
} from "@/lib/constants/palabras-clave";
import { TERMINOS_ACEPTO_BUTTON_TEXT, TERMINOS_NO_ACEPTO_BUTTON_TEXT } from "@/lib/constants/textos/terminos";
import { OTRA_SEDE_BUTTON_TEXT } from "@/lib/constants/textos/cita-catalogo";
import { OTRA_ESPECIALIDAD_BUTTON_TEXT } from "@/lib/constants/textos/cita-ubicacion";
import { normalizeText } from "@/lib/fsm/parsing/text/text";
import { ListPageButtonId } from "@/lib/enums/list-page-button-id";
import { OtherDistritoButtonId } from "@/lib/enums/other-distrito-button-id";
import { ReferenciaActionButtonId } from "@/lib/enums/referencia-action-button-id";
import { TerminosButtonId } from "@/lib/enums/terminos-button-id";

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
    expect(TERMINOS_ANSWERS.get(normalizeText(TERMINOS_ACEPTO_BUTTON_TEXT))).toBe(TerminosButtonId.ACCEPT);
    expect(TERMINOS_ANSWERS.get(normalizeText(TERMINOS_NO_ACEPTO_BUTTON_TEXT))).toBe(TerminosButtonId.DECLINE);
  });

  it("escribir la etiqueta Otra sede pide otra sede", () => {
    expect(OTHER_SEDE_ANSWERS.has(normalizeText(OTRA_SEDE_BUTTON_TEXT))).toBe(true);
  });

  it("escribir la etiqueta Otra especialidad sin establecimientos elige otra especialidad", () => {
    expect(NO_ESTABLECIMIENTOS_ANSWERS.get(normalizeText(OTRA_ESPECIALIDAD_BUTTON_TEXT))).toBe(OtherDistritoButtonId.OTHER_ESPECIALIDAD);
  });
});
