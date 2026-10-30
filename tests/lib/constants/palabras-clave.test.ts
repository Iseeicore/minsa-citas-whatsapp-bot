import { describe, expect, it } from "vitest";
import { CONSULTA_REFERENCIAS_ACTION_ANSWERS, REFERENCE_PAGE_ANSWERS } from "@/lib/constants/palabras-clave";
import { ListPageButtonId } from "@/lib/enums/list-page-button-id";
import { ReferenciaActionButtonId } from "@/lib/enums/referencia-action-button-id";

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
