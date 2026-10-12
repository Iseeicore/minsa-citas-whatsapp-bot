import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const ROOT = process.cwd();

const ARBITRARY_CSS_VARIABLE = /\b[\w-]+-\[var\([^)]+\)\]/g;
const ARBITRARY_HEX_COLOR = /\b[\w-]+-\[#[0-9a-fA-F]{3,8}\]/g;
const ARBITRARY_PX_TEXT_SIZE = /\btext-\[\d+px\]/g;
const EMOJI = /[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}]/gu;
const NATIVE_BUTTON_TAG = /<button\b/g;
const INLINE_REGEX_ARGUMENT = /\.(?:test|exec|match|matchAll|replace|replaceAll|split|search)\(\s*\/(?![/*])[^\n]*/g;
const DYNAMIC_REGEX = /new RegExp\([^\n]*/g;

const BASE_BUTTON_FILE = path.join("app", "components", "ui", "Button.tsx");

function appFiles(extensions: string[]): string[] {
  return fs
    .readdirSync(path.join(ROOT, "app"), { recursive: true, encoding: "utf8" })
    .filter((file) => extensions.some((extension) => file.endsWith(extension)))
    .map((file) => path.join("app", file));
}

function appViewFiles(): string[] {
  return appFiles([".tsx"]);
}

function matches(file: string, pattern: RegExp): string[] {
  const content = fs.readFileSync(path.join(ROOT, file), "utf8");
  return [...content.matchAll(pattern)].map((match) => `${file}: ${match[0]}`);
}

describe("reglas de arquitectura de UI", () => {
  const files = appViewFiles();

  it("no usa variables CSS como valor arbitrario de Tailwind (bg-[var(--x)])", () => {
    const found = files.flatMap((file) => matches(file, ARBITRARY_CSS_VARIABLE));
    expect(found).toEqual([]);
  });

  it("no usa colores hexadecimales quemados en las clases (bg-[#hex])", () => {
    const found = files.flatMap((file) => matches(file, ARBITRARY_HEX_COLOR));
    expect(found).toEqual([]);
  });

  it("no usa tamaños de texto en píxeles (text-[10px])", () => {
    const found = files.flatMap((file) => matches(file, ARBITRARY_PX_TEXT_SIZE));
    expect(found).toEqual([]);
  });

  it("no usa emojis en las vistas", () => {
    const found = files.flatMap((file) => matches(file, EMOJI));
    expect(found).toEqual([]);
  });

  it("solo el componente base Button escribe un button nativo, y lo escribe una vez", () => {
    const outside = files.filter((file) => file !== BASE_BUTTON_FILE).flatMap((file) => matches(file, NATIVE_BUTTON_TAG));

    expect(outside).toEqual([]);
    expect(matches(BASE_BUTTON_FILE, NATIVE_BUTTON_TAG)).toHaveLength(1);
  });

  it("no escribe expresiones regulares en el lugar donde se usan", () => {
    const sources = appFiles([".ts", ".tsx"]);
    const found = sources.flatMap((file) => [...matches(file, INLINE_REGEX_ARGUMENT), ...matches(file, DYNAMIC_REGEX)]);

    expect(found).toEqual([]);
  });
});
