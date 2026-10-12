import { describe, expect, it } from "vitest";
import {
  ALL_WHITESPACE_RUNS,
  CLOCK_TIME,
  COMBINING_ACCENT_MARKS,
  NON_LETTER_RUN,
  STRETCHED_CHARACTER,
  SYMBOLS_IN_UPPERCASE_TEXT,
  WHITESPACE_RUN,
  WORD_SEPARATORS,
} from "@/lib/fsm/parsing/text/text-patterns";

const ORIGINALS: ReadonlyArray<[string, RegExp, string, string]> = [
  ["COMBINING_ACCENT_MARKS", COMBINING_ACCENT_MARKS, "[̀-ͯ]", "g"],
  ["ALL_WHITESPACE_RUNS", ALL_WHITESPACE_RUNS, "\\s+", "g"],
  ["WHITESPACE_RUN", WHITESPACE_RUN, "\\s+", ""],
  ["CLOCK_TIME", CLOCK_TIME, "^\\d{2}:\\d{2}$", ""],
  ["SYMBOLS_IN_UPPERCASE_TEXT", SYMBOLS_IN_UPPERCASE_TEXT, "[^A-Z0-9 ]", "g"],
  ["WORD_SEPARATORS", WORD_SEPARATORS, "[^a-z0-9]+", "g"],
  ["STRETCHED_CHARACTER", STRETCHED_CHARACTER, "(.)\\1{2,}", "g"],
  ["NON_LETTER_RUN", NON_LETTER_RUN, "[^a-z]+", ""],
];

describe("patrones de texto compartidos", () => {
  it.each(ORIGINALS)("%s conserva la fuente y las banderas del patrón que estaba en línea", (_name, pattern, source, flags) => {
    expect(pattern.source).toBe(source);
    expect(pattern.flags).toBe(flags);
  });

  it("COMBINING_ACCENT_MARKS quita las tildes de un texto descompuesto y deja la letra base", () => {
    expect("Atención Ñandú".normalize("NFD").replace(COMBINING_ACCENT_MARKS, "")).toBe("Atencion Nandu");
  });

  it("ALL_WHITESPACE_RUNS reduce cada tramo de espacios, tabulaciones o saltos de línea", () => {
    expect("a  b\t\tc\n\nd".replace(ALL_WHITESPACE_RUNS, " ")).toBe("a b c d");
  });

  it("WHITESPACE_RUN separa palabras sin importar cuántos espacios haya entre ellas", () => {
    expect("uno   dos\ttres".split(WHITESPACE_RUN)).toEqual(["uno", "dos", "tres"]);
  });

  it("CLOCK_TIME solo acepta una hora completa de dos dígitos y dos dígitos", () => {
    expect(CLOCK_TIME.test("08:30")).toBe(true);
    expect(CLOCK_TIME.test("8:30")).toBe(false);
    expect(CLOCK_TIME.test("08:30|09:00")).toBe(false);
    expect(CLOCK_TIME.test("08:30 ")).toBe(false);
    expect(CLOCK_TIME.test("")).toBe(false);
  });

  it("SYMBOLS_IN_UPPERCASE_TEXT reemplaza cada signo, uno por uno, y deja letras, dígitos y espacios", () => {
    expect("¿CITA, YA!! 2".replace(SYMBOLS_IN_UPPERCASE_TEXT, " ")).toBe(" CITA  YA   2");
  });

  it("WORD_SEPARATORS reemplaza cada tramo de signos por una sola separación", () => {
    expect("si,,, claro!! ok".replace(WORD_SEPARATORS, " ")).toBe("si claro ok");
  });

  it("STRETCHED_CHARACTER reduce un carácter repetido tres o más veces y respeta el doble", () => {
    expect("siiii claaaro llave".replace(STRETCHED_CHARACTER, "$1")).toBe("si claro llave");
  });

  it("NON_LETTER_RUN separa por todo lo que no sea una letra minúscula sin tilde", () => {
    expect("san juan-de 2 lurigancho".split(NON_LETTER_RUN)).toEqual(["san", "juan", "de", "lurigancho"]);
  });

  it("los patrones globales dan el mismo resultado al usarse dos veces seguidas", () => {
    const globals: ReadonlyArray<[RegExp, string]> = [
      [COMBINING_ACCENT_MARKS, "á é í"],
      [ALL_WHITESPACE_RUNS, "a  b  c"],
      [SYMBOLS_IN_UPPERCASE_TEXT, "A.B.C"],
      [WORD_SEPARATORS, "a--b--c"],
      [STRETCHED_CHARACTER, "aaab bbbc"],
    ];
    for (const [pattern, text] of globals) {
      const first = text.replace(pattern, "_");
      const second = text.replace(pattern, "_");
      expect(second).toBe(first);
      expect(pattern.lastIndex).toBe(0);
    }
  });
});
