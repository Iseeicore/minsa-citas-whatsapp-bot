import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const ROOT = process.cwd();

const ARBITRARY_CSS_VARIABLE = /\b[\w-]+-\[var\([^)]+\)\]/g;
const ARBITRARY_HEX_COLOR = /\b[\w-]+-\[#[0-9a-fA-F]{3,8}\]/g;
const ARBITRARY_PX_TEXT_SIZE = /\btext-\[\d+px\]/g;
const EMOJI = /[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}]/gu;

function appViewFiles(): string[] {
  return fs
    .readdirSync(path.join(ROOT, "app"), { recursive: true, encoding: "utf8" })
    .filter((file) => file.endsWith(".tsx"))
    .map((file) => path.join("app", file));
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
});
