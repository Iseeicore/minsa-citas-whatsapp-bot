import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const ROOT = process.cwd();
const SOURCE_FOLDERS = ["app", "lib"];
const OWNER = "lib/enums/http-status.ts";

const HTTP_STATUS_LITERALS: ReadonlyArray<{ name: string; pattern: RegExp }> = [
  { name: "status: <número>", pattern: /\bstatus:\s*[1-5]\d\d\b/ },
  { name: ".status comparado con un número", pattern: /\.status\s*(?:[=!]==?|[<>]=?)\s*[1-5]\d\d\b/ },
  { name: "número comparado con .status", pattern: /\b[1-5]\d\d\s*(?:[=!]==?|[<>]=?)\s*[\w.?]+\.status\b/ },
  { name: "lista de números usada con .status", pattern: /\[\s*[1-5]\d\d(?:\s*,\s*[1-5]\d\d)*\s*\][^\n]*\.status\b/ },
  { name: "constante HTTP con número", pattern: /\b\w*(?:HTTP|STATUS)\w*\s*=\s*[1-5]\d\d\b/ },
];

function sourceFiles(folder: string): string[] {
  return fs
    .readdirSync(path.join(ROOT, folder), { recursive: true, encoding: "utf8" })
    .filter((file) => /\.(ts|tsx)$/.test(file))
    .map((file) => path.join(folder, file).split(path.sep).join("/"));
}

describe("códigos HTTP", () => {
  it.each(HTTP_STATUS_LITERALS)("solo lib/enums/http-status.ts escribe $name", ({ pattern }) => {
    const outside = SOURCE_FOLDERS.flatMap(sourceFiles)
      .filter((file) => file !== OWNER)
      .filter((file) => pattern.test(fs.readFileSync(path.join(ROOT, file), "utf8")));

    expect(outside).toEqual([]);
  });

  it("lib/constants/http-status.ts ya no existe", () => {
    expect(fs.existsSync(path.join(ROOT, "lib/constants/http-status.ts"))).toBe(false);
  });
});
