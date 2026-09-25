import { describe, expect, it } from "vitest";
import { resolveConfirmation } from "./confirmation-parser";

describe("resolveConfirmation", () => {
  it.each([
    "si",
    "Sí",
    "si por favor",
    "Sí, por favor",
    "SI POR FAVOR!",
    "sii",
    "siiiii",
    "confirmo",
    "dale",
    "daleee",
    "dale pues",
    "ok",
    "OK 👍",
    "de acuerdo",
    "claro",
    "claro que sí",
    "por supuesto",
    "sí, confirmo",
    "1",
  ])("reads %j as YES", (text) => {
    expect(resolveConfirmation(text)).toBe("YES");
  });

  it.each([
    "no",
    "No",
    "no, gracias",
    "no gracias",
    "cancelar",
    "otro horario",
    "otra hora",
    "ver más",
    "ver mas horarios",
    "cambiar",
    "mejor no",
    "2",
  ])("reads %j as NO", (text) => {
    expect(resolveConfirmation(text)).toBe("NO");
  });

  it.each([
    "",
    "   ",
    "??",
    "hola",
    "quiero mi cita",
    "si pero a las 3",
    "no se",
    "si no",
    "no si",
    "a las 3 por favor",
    "1:45 pm",
    "12",
    "sí 2",
  ])("leaves %j as UNKNOWN", (text) => {
    expect(resolveConfirmation(text)).toBe("UNKNOWN");
  });
});
