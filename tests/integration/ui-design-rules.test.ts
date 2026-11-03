import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const ROOT = process.cwd();

const ARBITRARY_CSS_VARIABLE = /\b[\w-]+-\[var\([^)]+\)\]/g;
const ARBITRARY_HEX_COLOR = /\b[\w-]+-\[#[0-9a-fA-F]{3,8}\]/g;
const ARBITRARY_PX_TEXT_SIZE = /\btext-\[\d+px\]/g;
const EMOJI = /[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}]/gu;
const NATIVE_BUTTON_TAG = /<button\b/g;
const NATIVE_ANCHOR_TAG = /<a(?:\s|>|$)/gm;
const NATIVE_DIALOG_TAG = /<dialog\b/g;
const NATIVE_HEADING_TAG = /<h[1-6]\b/g;
const HAND_MADE_DIALOG = /role="(?:alert)?dialog"|aria-modal/g;
const INLINE_REGEX_ARGUMENT = /\.(?:test|exec|match|matchAll|replace|replaceAll|split|search)\(\s*\/(?![/*])[^\n]*/g;
const DYNAMIC_REGEX = /new RegExp\([^\n]*/g;

const ARBITRARY_VALUE = /[\w-]+-\[[^\]\s]+\]|\[@[^\]]+\]:/g;

const BASE_BUTTON_FILE = path.join("app", "components", "ui", "Button.tsx");
const BASE_ANCHOR_FILE = path.join("app", "components", "ui", "AnchorLink.tsx");
const BASE_DIALOG_FILE = path.join("app", "components", "ui", "Dialog.tsx");
const BASE_HEADING_FILE = path.join("app", "components", "ui", "Heading.tsx");
const HEADING_EXCEPTIONS = [path.join("app", "components", "landing", "LandingHero.tsx"), path.join("app", "global-error.tsx")];
const LANDING_FILE = path.join("app", "components", "Landing.tsx");
const LANDING_FOLDER = path.join("app", "components", "landing") + path.sep;

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

  it.each([
    [BASE_ANCHOR_FILE, NATIVE_ANCHOR_TAG],
    [BASE_DIALOG_FILE, NATIVE_DIALOG_TAG],
  ])("solo %s escribe su elemento nativo, y lo escribe una vez", (baseFile, nativeTag) => {
    const outside = files.filter((file) => file !== baseFile).flatMap((file) => matches(file, nativeTag));

    expect(outside).toEqual([]);
    expect(matches(baseFile, nativeTag)).toHaveLength(1);
  });

  it("solo Heading escribe h1 a h6, salvo el héroe de la landing y global-error, que arma su propio html", () => {
    const allowed = [BASE_HEADING_FILE, ...HEADING_EXCEPTIONS];
    const outside = files.filter((file) => !allowed.includes(file)).flatMap((file) => matches(file, NATIVE_HEADING_TAG));

    expect(outside).toEqual([]);
  });

  it("ningún diálogo se arma a mano con role o aria-modal: todos componen Dialog", () => {
    const found = files.filter((file) => file !== BASE_DIALOG_FILE).flatMap((file) => matches(file, HAND_MADE_DIALOG));

    expect(found).toEqual([]);
  });

  it("la landing usa tokens de @theme y no valores arbitrarios de Tailwind", () => {
    const landing = files.filter((file) => file === LANDING_FILE || file.startsWith(LANDING_FOLDER));
    const found = landing.flatMap((file) => matches(file, ARBITRARY_VALUE));

    expect(landing.length).toBeGreaterThan(1);
    expect(found).toEqual([]);
  });

  it("no escribe expresiones regulares en el lugar donde se usan", () => {
    const sources = appFiles([".ts", ".tsx"]);
    const found = sources.flatMap((file) => [...matches(file, INLINE_REGEX_ARGUMENT), ...matches(file, DYNAMIC_REGEX)]);

    expect(found).toEqual([]);
  });
});
