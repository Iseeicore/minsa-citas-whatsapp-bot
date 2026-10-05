import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const SANDBOX_CHAT_DIR = path.join(process.cwd(), "app", "components", "sandbox-chat");
const DNI_CARD = fs.readFileSync(path.join(SANDBOX_CHAT_DIR, "DniCard.tsx"), "utf8");

const QUOTED_TEXT_WITH_AMOUNT_OR_TYPE = /(["'`])[^"'`\n]*(?:d[ií]gitos|\bDNI\b)[^"'`\n]*\1/gi;

describe("el Sandbox pide solo el número de documento", () => {
  it("el campo acepta hasta 9 dígitos (DNI de 8 o carnet de extranjería de 9)", () => {
    expect(DNI_CARD).toContain("maxLength={9}");
    expect(DNI_CARD).not.toContain("maxLength={8}");
  });

  it("el texto de ayuda y la etiqueta accesible no mencionan cantidad ni tipo", () => {
    expect(DNI_CARD).toContain('placeholder="Ingresa tu número de documento"');
    expect(DNI_CARD).toContain('aria-label="Número de documento"');
  });

  it("ningún texto visible de sandbox-chat menciona cuántos dígitos ni «DNI»", () => {
    const offenders = fs
      .readdirSync(SANDBOX_CHAT_DIR)
      .filter((file) => file.endsWith(".tsx"))
      .flatMap((file) => {
        const content = fs.readFileSync(path.join(SANDBOX_CHAT_DIR, file), "utf8");
        return [...content.matchAll(QUOTED_TEXT_WITH_AMOUNT_OR_TYPE)].map((match) => `${file}: ${match[0]}`);
      });

    expect(offenders).toEqual([]);
  });
});
