import { describe, expect, it } from "vitest";
import { detectChangeDistritoIntent } from "@/lib/fsm/parsing/selection/change-distrito-intent";

describe("detectChangeDistritoIntent", () => {
  it.each([
    "ya no quiero esta ubicación",
    "No quiero esa ubicación",
    "ya no quiero ese distrito",
    "quiero otro distrito",
    "buscar en otro distrito",
    "mejor otra zona",
    "cambiar de distrito",
    "quiero cambiar el distrito",
    "me equivoqué de distrito",
    "ese no es mi distrito",
  ])("recognises «%s» as wanting another district", (text) => {
    expect(detectChangeDistritoIntent(text)).toBe(true);
  });

  it.each([
    "San Borja",
    "Odontología",
    "no quiero esa fecha",
    "otra fecha",
    "otro establecimiento",
    "ya no quiero nada",
    "quiero salir",
    "",
  ])("does not treat «%s» as wanting another district", (text) => {
    expect(detectChangeDistritoIntent(text)).toBe(false);
  });
});
